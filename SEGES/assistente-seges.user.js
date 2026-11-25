// ==UserScript==
// @name         SEGES • Assistente — Faltas, Planos e Notas
// @namespace    https://github.com/arthurhenriquetb/repo4htba
// @version      3.1.0
// @description  Um script para faltas e planejamento; tabela de turmas, revisão prévia e execução sem retomada.
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
  if (window !== window.top) return; // o iframe interno não abre outra instância
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
  'use strict';
  // Nunca executar outra cópia do planejador dentro de um iframe do próprio SEGES.
  if (window !== window.top) return;
  const BASE = '/weekly_plans';
  const CIENCIAS = /CI[ÊE]NCIAS|BIOLOGIA/i;
  const PRATICAS = /PR[ÁA]TICAS?\s+EXPERIMENTA(?:L|IS)/i;
  const PERFIS = [
{regex:new RegExp("PR[ÁA]TICAS?\\s+EXPERIMENTA(?:L|IS)",'i'),text:"Aula ministrada com o conteúdo: aplicação de atividades com a metodologia de resolução de problemas e confecção de projetos elaborados em conformidade com o conteúdo ministrado semanalmente, para que os alunos tenham a oportunidade de realizar alguma tarefa ou observar algum experimento que mostre o conteúdo de forma prática e lúdica associado ao cotidiano dos estudantes."},
{regex:new RegExp("ELETIVAS?",'i'),text:"Eletiva multisseriada ministrada com conteúdo interdisciplinar, visando fortalecer as disciplinas da base curricular (BNCC) por meio de uma abordagem integradora lúdica e em consonância com o Guia de Aprendizagem, avaliações diagnósticas e varal dos sonhos."},
{regex:new RegExp("PENSAMENTO\\s+CIENT[ÍI]FICO",'i'),text:"Planejamento e execução de materiais didáticos interativos, associados ao material estruturado de pensamento científico, acompanhado da exposição de documentários de divulgação científica."},
{regex:new RegExp("PROJETO\\s+DE\\s+VIDA",'i'),text:"Aula ministrada para a disciplina de Projeto de Vida, Com o conteúdo Multisseriado e interdisciplinar para fortalecer as disciplinas da base curricular (BNCC) por meio de uma abordagem integradora lúdica e em consonância com o Guia de Aprendizagem, avaliações diagnósticas e varal dos sonhos do projeto de vida dos estudantes."},
{regex:new RegExp("ESTUDO\\s+ORIENTADO",'i'),text:"Aplicação de atividades enviadas previamente pelos demais professores de outras disciplinas, em consonância com as diretrizes e temáticas dispostas na BNCC e orientações curriculares da SEDU, através da metodologia de resolução de exercícios e estímulo ao protagonismo dos estudantes para resolução das atividades."},
{regex:new RegExp("PROTAGONISMO|CLUBE",'i'),text:"Aula ministrada para a disciplina de Clube de Protagonismo com conteúdos desenvolvidos de acordo com o Material Estruturado, em consonância com o currículo e varal dos sonhos dos estudantes."}
];
  let catalogo = [], semanasPorTurma = new Map(), selecionadas = new Map();
  let arquivos = new Map(), substituicoes = new Map();
  let ativo = false, cancelado = false, controller = null, quadro = null, quadroAtual = null;
  let linhasLog = [], progresso = {atual:0,total:0}, ultimoRelatorio = null;
  let iframe = null, operacaoAtual = null;
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const dormir = ms => new Promise(resolve => setTimeout(resolve,ms));
  const html = v => String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const normal = v => String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  function urlSeges(href) {
    try {
      const url=new URL(href,location.href);
      return url.origin===location.origin && url.protocol==='https:' && url.pathname.startsWith(BASE) ? url : null;
    } catch (_) {return null;}
  }
  function verificarAtivo() {
    if(cancelado || !ativo || !document.documentElement.isConnected)throw Error('Execução interrompida.');
  }
  function cancelar() {
    cancelado=true;ativo=false;controller?.abort();
    if(iframe){iframe.remove();iframe=null;}
    if(quadro){quadro.remove();quadro=null;}
    operacaoAtual=null;
    status('Interrompido. Nada foi guardado. Recarregue a guia para iniciar outra operação.');
    atualizarBotoes();
  }
  function log(msg) {
    const linha='['+new Date().toLocaleTimeString('pt-BR')+'] '+msg;
    linhasLog.push(linha);
    const pre=$('#seges-v3-log');
    if(pre){pre.textContent=linhasLog.join('\n');pre.scrollTop=pre.scrollHeight;}
    console.log('[SEGES • Planos]',msg);
  }
  function status(msg) {
    const el=$('#seges-v3-status');if(el)el.textContent=msg;
    log(msg);
  }
  function atualizarProgresso() {
    const valor=progresso.total ? Math.round(100*progresso.atual/progresso.total):0;
    const fill=$('#seges-v3-progress'),label=$('#seges-v3-percentage');
    if(fill)fill.style.width=valor+'%';
    if(label)label.textContent=valor+'%';
  }
  function iniciarOperacao() {
    if(cancelado)throw Error('Esta execução foi cancelada. Recarregue a guia antes de iniciar outra.');
    if(ativo)throw Error('Uma operação já está em andamento.');
    ativo=true;controller=new AbortController();
    linhasLog=[];progresso={atual:0,total:0};atualizarProgresso();
    atualizarBotoes();
  }
  function encerrarOperacao() {
    ativo=false;controller=null;atualizarBotoes();
    atualizarProgresso();
  }
  function atualizarBotoes() {
    const start=$('#seges-v3-open'),del=$('#seges-v3-delete'),stop=$('#seges-v3-stop');
    if(start)start.disabled=ativo||cancelado;
    if(del)del.disabled=ativo||cancelado;
    if(stop)stop.disabled=!ativo;
  }
  function estilos() {
    if($('#seges-v3-style'))return;
    const style=document.createElement('style');style.id='seges-v3-style';
    style.textContent=`
      #seges-v3-panel{position:fixed;right:12px;top:90px;width:320px;max-width:calc(100vw - 20px);max-height:80vh;overflow:auto;background:white;border-radius:12px;border:1px solid #c8d4df;box-shadow:0 6px 26px #0003;z-index:2147483630;font:13px/1.45 Arial,sans-serif;color:#273e52}
      #seges-v3-panel .head{background:#135b8e;color:white;padding:12px 14px;font-weight:bold;cursor:grab;user-select:none;touch-action:none}
      #seges-v3-panel .body{padding:12px}
      #seges-v3-panel button,#seges-v3-overlay button{cursor:pointer;border:0;border-radius:7px;padding:8px 11px;background:#e7eff6;color:#20425e;font:inherit}
      #seges-v3-panel button.primary,#seges-v3-overlay button.primary{background:#17699e;color:#fff}
      #seges-v3-panel button.danger,#seges-v3-overlay button.danger{background:#be3e43;color:#fff}
      #seges-v3-panel button:disabled,#seges-v3-overlay button:disabled{opacity:.45;cursor:default}
      #seges-v3-overlay{position:fixed;inset:0;background:#15243ab0;z-index:2147483640;display:flex;align-items:center;justify-content:center;padding:15px;font:13px/1.4 Arial,sans-serif;color:#283d52}
      #seges-v3-overlay .dialog{background:white;border-radius:12px;padding:17px;max-width:min(1080px,97vw);max-height:92vh;overflow:auto;width:100%;box-shadow:0 8px 40px #1115}
      #seges-v3-overlay h3{font-size:17px;margin:0 0 9px}
      #seges-v3-overlay .actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px}
      #seges-v3-overlay table{border-collapse:separate;border-spacing:0;width:100%;font-size:12px}
      #seges-v3-overlay th,#seges-v3-overlay td{border-bottom:1px solid #e3eaf0;padding:6px;text-align:center;white-space:nowrap}
      #seges-v3-overlay th{background:#f1f5f9;position:sticky;top:0;z-index:2}
      #seges-v3-overlay td:first-child,#seges-v3-overlay th:first-child{position:sticky;left:0;background:#fff;text-align:left;z-index:3}
      #seges-v3-overlay th:first-child{background:#f1f5f9;z-index:4}
      #seges-v3-overlay select,#seges-v3-overlay input[type=number]{padding:6px;border:1px solid #c6d5e0;border-radius:6px;background:#fff;max-width:100%}
      #seges-v3-overlay input[type=checkbox]{width:16px;height:16px;accent-color:#156da1}
      #seges-v3-overlay .scroll{overflow:auto;max-height:55vh;border:1px solid #dce5ec;border-radius:8px}
      #seges-v3-overlay .hint{font-size:12px;color:#5a6c7c;margin:7px 0}
    `;
    document.head.appendChild(style);
  }
  function painel() {
    estilos();
    if($('#seges-v3-panel'))return;
    const el=document.createElement('div');el.id='seges-v3-panel';
    el.innerHTML=`<div class="head">SEGES • Assistente — Planos</div><div class="body">
      <div id="seges-v3-status" style="margin-bottom:8px">Pronto. Nada será retomado depois que a guia for fechada.</div>
      <div style="height:9px;background:#e1eaf2;border-radius:8px;overflow:hidden"><div id="seges-v3-progress" style="height:100%;width:0;background:#1578b3"></div></div>
      <div id="seges-v3-percentage" style="font-size:11px;text-align:right">0%</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px">
        <button id="seges-v3-open" class="primary">Preencher planos</button>
        <button id="seges-v3-delete">Excluir planos</button>
        <button id="seges-v3-stop" class="danger" disabled>Parar</button>
      </div>
      <details style="margin-top:8px"><summary style="cursor:pointer">Mostrar log</summary>
        <pre id="seges-v3-log" style="max-height:180px;overflow:auto;white-space:pre-wrap;font:11px/1.35 Consolas,monospace"></pre>
        <button id="seges-v3-logdown">Baixar log TXT</button>
      </details></div>`;
    document.body.appendChild(el);
    $('#seges-v3-open').onclick=()=>abrirTabela().catch(falhar);
    $('#seges-v3-delete').onclick=()=>abrirExclusoes().catch(falhar);
    $('#seges-v3-stop').onclick=cancelar;
    $('#seges-v3-logdown').onclick=()=>baixar('seges-log.txt',linhasLog.join('\n'));
    let drag=null;
    const head=$('.head',el);
    head.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;
      const b=el.getBoundingClientRect();
      drag={id:e.pointerId,dx:e.clientX-b.left,dy:e.clientY-b.top};
      el.style.right='auto';e.preventDefault();
    });
    window.addEventListener('pointermove',e=>{
      if(!drag||e.pointerId!==drag.id)return;
      el.style.left=Math.max(0,Math.min(window.innerWidth-el.offsetWidth,e.clientX-drag.dx))+'px';
      el.style.top=Math.max(0,Math.min(window.innerHeight-45,e.clientY-drag.dy))+'px';
    });
    window.addEventListener('pointerup',e=>{if(drag?.id===e.pointerId)drag=null;});
    window.addEventListener('beforeunload',()=>{
      cancelado=true;controller?.abort();if(iframe)iframe.src='about:blank';
    },{once:true});
  }
  function modal(content) {
    $('#seges-v3-overlay')?.remove();
    const el=document.createElement('div');el.id='seges-v3-overlay';
    el.innerHTML='<div class="dialog">'+content+'</div>';
    document.body.appendChild(el);quadro=el;return el;
  }
  function fecharModal() {quadro?.remove();quadro=null;}
  function baixar(name,content) {
    const blob=new Blob([content],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function falhar(error) {
    if(cancelado)return;
    status('Interrompido: '+String(error?.message||error));
    encerrarOperacao();
    iframe?.remove();iframe=null;
    const msg=$('#seges-v3-message');if(msg)msg.textContent=String(error?.message||error);
  }
  async function buscarPagina(href) {
    verificarAtivo();
    const url=urlSeges(href);if(!url)throw Error('URL fora da área de planos do SEGES.');
    const response=await fetch(url.href,{method:'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal});
    verificarAtivo();
    const returned=urlSeges(response.url);
    if(!response.ok||!returned||!returned.pathname.startsWith(BASE))
      throw Error('Página do SEGES indisponível ou sessão expirada (HTTP '+response.status+').');
    const body=await response.text();
    verificarAtivo();
    const doc=new DOMParser().parseFromString(body,'text/html');
    if(!doc.querySelector('body'))throw Error('O SEGES devolveu uma página inválida.');
    return doc;
  }
  function turmasDisponiveis(doc) {
    const seen=new Set();
    return $$('a[href*="weekly_plans?classroom_id="]',doc).map(a=>{
      const url=urlSeges(a.getAttribute('href'));
      const id=url?.searchParams.get('classroom_id');
      if(!id||seen.has(id))return null;
      seen.add(id);
      const tr=a.closest('tr'),cells=tr?.querySelectorAll('td');
      const name=String(cells?.[0]?.textContent||a.textContent||'').trim();
      return {id,name:name||'Turma '+id,url:url.href};
    }).filter(Boolean);
  }
  function semanasDisponiveis(doc,turma) {
    return $$('table.table.table-striped tbody tr.middle',doc).map(tr=>{
      const cells=tr.querySelectorAll('td'),a=$('a.btn.btn-sm.btn-primary',tr);
      if(cells.length<3||!a)return null;
      const week=Number(cells[0].textContent.trim());
      const url=urlSeges(a.getAttribute('href'));
      if(!Number.isInteger(week)||week<=0||!url)return null;
      const existing=/^\/weekly_plans\/\d+(?:\/edit)?\/?$/.test(url.pathname);
      const missing=/\/weekly_plans\/new\/?$/.test(url.pathname);
      if(!existing&&!missing)return null;
      return {week,url:url.href,existing,period:String(cells[1].textContent||'').trim(),
        status:String(cells[2].textContent||'').trim(),classId:turma.id,rowHtml:tr.outerHTML};
    }).filter(Boolean);
  }
  function etapaNome(nome) {
    const match=String(nome||'').match(/(?:^|\D)([6-9])\s*[º°ªo]?\s*(?:ano|série|turma|\d\b)/i);
    if(match)return 'EF'+match[1];
    if(/\b(?:ensino\s*m[eé]dio|[123]\s*[ªº°]\s*s[eé]rie)\b/i.test(nome)){
      const serie=String(nome).match(/[123]/);return serie?'EM'+serie[0]:'EM1';
    }
    return '';
  }
  function etapaOpcoes(selected) {
    const names=[['','Identificar pela turma'],...Array.from({length:9},(_,i)=>['EF'+(i+1),(i+1)+'º Fundamental']),
      ['EM1','1ª série EM'],['EM2','2ª série EM'],['EM3','3ª série EM']];
    return names.map(([v,name])=>`<option value="${v}" ${selected===v?'selected':''}>${html(name)}</option>`).join('');
  }
  function semanasSelecionadas() {
    return catalogo.map(cls=>{
      const list=semanasPorTurma.get(cls.id)||[];
      const set=selecionadas.get(cls.id)||new Set();
      return {...cls,stage:$('#seges-stage-'+cls.id)?.value||etapaNome(cls.name),
        weeks:list.filter(w=>set.has(w.week)).sort((a,b)=>a.week-b.week)};
    }).filter(cls=>cls.weeks.length);
  }
  function sugerirSemanas(quantity=2) {
    for(const cls of catalogo){
      const weeks=semanasPorTurma.get(cls.id)||[];
      const latestPlanned=Math.max(0,...weeks.filter(w=>w.existing).map(w=>w.week));
      const after=weeks.filter(w=>!w.existing && w.week>latestPlanned).sort((a,b)=>a.week-b.week);
      const pending=weeks.filter(w=>!w.existing).sort((a,b)=>a.week-b.week);
      const first=(after.length?after:pending).slice(0,quantity);
      selecionadas.set(cls.id,new Set(first.map(w=>w.week)));
    }
  }
  function atualizarTabela() {
    const showExisting=$('#seges-v3-existing')?.checked||false;
    const allWeeks=[...new Set(catalogo.flatMap(cls=>(semanasPorTurma.get(cls.id)||[])
      .filter(w=>showExisting||!w.existing).map(w=>w.week)))].sort((a,b)=>a-b);
    const header=allWeeks.map(w=>`<th title="Semana ${w}">${w}</th>`).join('');
    const rows=catalogo.map(cls=>{
      const possible=new Map((semanasPorTurma.get(cls.id)||[]).map(w=>[w.week,w]));
      const selected=selecionadas.get(cls.id)||new Set();
      const cells=allWeeks.map(w=>{
        const item=possible.get(w);
        if(!item||(item.existing&&!showExisting))return '<td>·</td>';
        return `<td title="${html(cls.name)} · ${html(item.period)}"><input type="checkbox" data-cell-class="${html(cls.id)}" data-cell-week="${w}" ${selected.has(w)?'checked':''}></td>`;
      }).join('');
      return `<tr><td><label style="display:flex;align-items:center;gap:6px;white-space:nowrap">
          <input type="checkbox" data-class-toggle="${html(cls.id)}" ${selected.size?'checked':''}>
          <strong>${html(cls.name)}</strong></label></td>
        <td><select id="seges-stage-${html(cls.id)}" data-class-stage="${html(cls.id)}" title="Ano ou série" style="width:125px">${etapaOpcoes(quadroAtual?.stages?.get(cls.id)||etapaNome(cls.name))}</select></td>
        ${cells}</tr>`;
    }).join('');
    const root=$('#seges-v3-grid');if(!root)return;
    root.innerHTML=`<div class="scroll"><table><thead><tr><th>Turma</th><th>Etapa</th>${header}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="hint">Marque/desmarque as células. Cada coluna é uma semana, cada linha é uma turma; um ponto significa que não há semana selecionável nesse filtro.</p>`;
    root.onchange=e=>{
      const toggle=e.target.closest('[data-class-toggle]');
      if(toggle){
        const cls=catalogo.find(item=>item.id===toggle.dataset.classToggle);
        const amount=Number($('#seges-v3-quantity')?.value||2);
        const weeks=semanasPorTurma.get(cls.id)||[];
        const latest=Math.max(0,...weeks.filter(w=>w.existing).map(w=>w.week));
        const upcoming=weeks.filter(w=>!w.existing && w.week>latest).sort((a,b)=>a.week-b.week);
        const missing=weeks.filter(w=>!w.existing).sort((a,b)=>a.week-b.week);
        selecionadas.set(cls.id,new Set(toggle.checked?(upcoming.length?upcoming:missing).slice(0,amount).map(w=>w.week):[]));
        atualizarTabela();return;
      }
      const cell=e.target.closest('[data-cell-week]');
      if(cell){
        const set=selecionadas.get(cell.dataset.cellClass)||new Set();
        const week=Number(cell.dataset.cellWeek);
        if(cell.checked)set.add(week);else set.delete(week);
        selecionadas.set(cell.dataset.cellClass,set);
      }
      const stage=e.target.closest('[data-class-stage]');
      if(stage){quadroAtual.stages.set(stage.dataset.classStage,stage.value);}
      const count=$('#seges-v3-count');
      if(count)count.textContent=semanasSelecionadas().reduce((n,c)=>n+c.weeks.length,0)+' semanas marcadas';
    };
    const count=$('#seges-v3-count');
    if(count)count.textContent=semanasSelecionadas().reduce((n,c)=>n+c.weeks.length,0)+' semanas marcadas';
  }
  async function abrirTabela() {
    iniciarOperacao();
    arquivos=new Map();substituicoes=new Map();ultimoRelatorio=null;
    quadroAtual={stages:new Map(),review:null};
    const root=modal(`<h3>Escolher turmas e semanas</h3>
      <p class="hint">Uma tabela para todas as turmas. As próximas semanas sem plano, após a última já planejada, vêm marcadas (duas por turma). Você pode ajustar a quantidade e qualquer célula.</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <label>Semanas por turma <select id="seges-v3-quantity"><option>2</option><option>3</option><option>4</option><option>1</option></select></label>
        <button id="seges-v3-reselect">Marcar próximas pendentes</button>
        <label><input id="seges-v3-existing" type="checkbox"> Mostrar semanas com plano</label>
        <strong id="seges-v3-count"></strong>
      </div>
      <div id="seges-v3-grid">Lendo as turmas e semanas...</div>
      <p id="seges-v3-message" class="hint"></p>
      <div class="actions">
        <button id="seges-v3-cancel" class="danger">Cancelar</button>
        <button id="seges-v3-preview" class="primary" disabled>Ver sugestões e revisar</button>
      </div>`);
    $('#seges-v3-cancel',root).onclick=cancelar;
    $('#seges-v3-reselect',root).onclick=()=>{
      sugerirSemanas(Number($('#seges-v3-quantity').value));atualizarTabela();
    };
    $('#seges-v3-quantity',root).onchange=()=>{sugerirSemanas(Number($('#seges-v3-quantity').value));atualizarTabela();};
    $('#seges-v3-existing',root).onchange=atualizarTabela;
    $('#seges-v3-preview',root).onclick=()=>prepararPrevia().catch(falhar);
    try {
      const main=location.pathname===BASE&&!location.search ? document:await buscarPagina(BASE);
      catalogo=turmasDisponiveis(main);
      if(!catalogo.length)throw Error('Não encontrei turmas disponíveis na página de Planos Semanais.');
      progresso.total=catalogo.length;atualizarProgresso();
      for(const cls of catalogo){
        verificarAtivo();
        const doc=await buscarPagina(cls.url);
        semanasPorTurma.set(cls.id,semanasDisponiveis(doc,cls));
        progresso.atual++;atualizarProgresso();
        status('Lendo turmas: '+progresso.atual+'/'+catalogo.length+' · '+cls.name);
      }
      sugerirSemanas(2);atualizarTabela();
      $('#seges-v3-preview').disabled=false;
      status('Tabela pronta. Selecione as semanas e veja as sugestões.');
    } catch(error){falhar(error);}
    finally {encerrarOperacao();}
  }
  function arrayDados(value) {
    if(!value)return [];
    const source=String(value).trim();
    const tryParse=(raw)=>{
      try {const parsed=JSON.parse(raw);return Array.isArray(parsed)?parsed.map(String):null;}
      catch(_) {return null;}
    };
    const direct=tryParse(source);
    if(direct)return direct;
    const decoder=document.createElement('textarea');
    decoder.innerHTML=source;
    const decoded=tryParse(decoder.value);
    return decoded||[];
  }
  function opcoesDoBloco(root) {
    return $$('.structured-weekly-plan-id-select option',root)
      .filter(opt=>String(opt.value).trim()).map(opt=>({
        value:String(opt.value),label:String(opt.textContent||'').trim(),
        knowledges:arrayDados(opt.getAttribute('data-knowledges')||opt.dataset.knowledges),
        methodologies:arrayDados(opt.getAttribute('data-methodologies')||opt.dataset.methodologies)
      })).filter(item=>item.label);
  }
  function opcoesDaAula(tr) {
    const seen=new Map();
    function add(items){for(const item of items)if(!seen.has(item.value))seen.set(item.value,item);}
    add(opcoesDoBloco(tr));
    const button=$('[data-association-insertion-template]',tr);
    const template=button?.getAttribute('data-association-insertion-template');
    if(template){
      const box=document.createElement('div');
      box.innerHTML=template;
      add(opcoesDoBloco(box));
      if(!seen.size){
        const decoder=document.createElement('textarea');decoder.innerHTML=template;
        box.innerHTML=decoder.value;add(opcoesDoBloco(box));
      }
    }
    return [...seen.values()];
  }
  function codigoHabilidade(label) {
  const text=String(label||'').toUpperCase().replace(/\s/g,'');
  const match=text.match(/EF0?[1-9]CI\d{2}[A-Z]?|EM13(?:CNT|MAT|LGG|CHS)\d{3}/);
  return match?match[0].replace(/^EF([1-9])CI/,'EF0$1CI'):'';
}

  function chaveHabilidade(opt) {
  if(!opt)return '';
  const label=String(opt.label||'').trim();
  const codigo=codigoHabilidade(label);
  if(codigo)return 'code:'+codigo;
  const texto=normal(label).replace(/^\s*(?:habilidade|objeto de conhecimento)\s*:?\s*/,'')
    .replace(/[\s\u00a0]+/g,' ').replace(/[.!;:]+$/,'').trim();
  if(texto&&!/^(?:sem habilidade|nenhuma habilidade|selecione|selecione uma habilidade|escolha uma habilidade|--|-|\d+)$/i.test(texto))
    return 'text:'+texto;
  return 'id:'+String(opt.value||''); // Apenas comparador interno. Nunca exibir identificadores ao usuário.
}

  function textoHabilidade(opt) {
  if(!opt)return 'Habilidade não identificada';
  const title=String(opt.label||'').trim();
  return !title||/^\d+$/.test(title)||/^(?:sem habilidade|nenhuma habilidade)$/i.test(normal(title))?
    'Habilidade disponível no SEGES' : title;
}

  function mesmaHabilidade(a,b) {
  return !!chaveHabilidade(a) && chaveHabilidade(a)===chaveHabilidade(b);
}

  function mapearHabilidade(ref,options) {
  if(!ref)return null;
  const choices=options||[];
  return choices.find(opt=>mesmaHabilidade(ref,opt))||null;
}

  function classificarHabilidade(label) {
    const code=codigoHabilidade(label);
    const ef=code.match(/EF(0[1-9])CI/);
    if(ef)return 'EF'+Number(ef[1]);
    if(/EM13(?:CNT|MAT|LGG|CHS)/.test(code))return 'EM';
    return '';
  }
  function validasParaTurma(options,stage) {
    if(!stage)return options.map(opt=>({...opt,manualOnly:true}));
    return options.filter(opt=>{
      const tag=classificarHabilidade(opt.label);
      return !tag || tag===(stage.startsWith('EM')?'EM':stage);
    }).map(opt=>({...opt,manualOnly:!classificarHabilidade(opt.label)}));
  }
  function lerAulas(doc,turma,week) {
    const rows=$$('#weekly_plan tr.by-curriculum-discipline',doc);
    if(!rows.length){
      // Semana sem aulas (feriado, conselho, encerramento do trimestre etc.).
      // Somente considerar ausência legítima em um formulário do SEGES ou numa
      // página que declare explicitamente que não existem aulas.
      const pageText=String(doc.body?.textContent||'').replace(/\s+/g,' ').trim();
      const emptyNotice=/(?:n[aã]o\s+(?:h[aá]|existem?)\s+aulas?|nenhuma\s+aula|sem\s+aulas?|aulas?\s+n[aã]o\s+(?:cadastradas?|encontradas?))/i.test(pageText);
      const isForm=!!$('#weekly_plan',doc);
      if(!isForm && !emptyNotice){
        throw Error('Não foi possível reconhecer o formulário nem confirmar ausência de aulas na semana '+week.week+'. Verifique a página no SEGES.');
      }
      return [];
    }
    return rows.map((tr,index)=>{
      const discipline=String(tr.querySelectorAll('td')[1]?.textContent||'').trim();
      const date=$('input[name*="[date]"]',tr)?.value||'';
      const textarea=$('textarea',tr);
      const existingText=String(textarea?.value||'').trim();
      const sel=$('.structured-weekly-plan-id-select',tr);
      const existingSkill=String(sel?.value||'').trim();
      const skillOption=Array.from(sel?.options||[]).find(opt=>String(opt.value)===existingSkill);
      const existingSkillLabel=String(skillOption?.textContent||'').trim();
      const profile=PERFIS.find(item=>item.regex.test(discipline));
      const kind=profile?'manual':CIENCIAS.test(discipline)?'science':'other';
      const selections=(selector)=>$$(selector,tr).flatMap(el=>Array.from(el.selectedOptions||[])
        .filter(opt=>opt.value).map(opt=>String(opt.value)));
      const hasKnowledge=selections('.structured-weekly-plan-knowledges-select').length>0;
      const hasMethod=selections('.structured-weekly-plan-methodologies-select').length>0;
      const evaluation=$('.structured-weekly-plan-evaluation-select',tr)?.value||'';
      return {index,discipline,date,kind,existingText,existingSkill,existingSkillLabel,hasKnowledge,hasMethod,evaluation,
        opts:kind==='science'?opcoesDaAula(tr):[],manualText:profile?.text||''};
    });
  }
  function habilidadeRecente(form,disciplina=null,ordem=null){
    const science=form?.rows?.filter(row=>row.kind==='science'&&row.existingSkill)||[];
    const candidates=disciplina
      ? science.filter(row=>normal(row.discipline)===normal(disciplina))
      : science;
    const relevant=Number.isInteger(ordem) && candidates[ordem] ? candidates[ordem] : candidates.at(-1);
    if(!relevant)return null;
    const ref=relevant.opts.find(opt=>String(opt.value)===String(relevant.existingSkill))||
      {value:relevant.existingSkill,label:relevant.existingSkillLabel||''};
    return {value:String(ref.value),label:String(ref.label||''),key:chaveHabilidade(ref)};
  }
  async function lerSemana(cls,week) {
    const key=cls.id+':'+week.week;
    if(arquivos.has(key))return arquivos.get(key);
    const doc=await buscarPagina(week.url);
    const result={cls,week,rows:lerAulas(doc,cls,week)};
    arquivos.set(key,result);
    return result;
  }
  function temPlano(form) {
    return !!form?.rows?.some(row=>row.existingSkill||row.existingText);
  }
  function registroAnterior(cls,week) {
    return (semanasPorTurma.get(cls.id)||[])
      .filter(w=>w.week<week.week && w.existing)
      .sort((a,b)=>b.week-a.week);
  }
  async function prepararPrevia() {
    iniciarOperacao();
    const selected=semanasSelecionadas();
    if(!selected.length){encerrarOperacao();alert('Marque ao menos uma semana.');return;}
    try {
      $('#seges-v3-preview').disabled=true;
      const chosen=new Map();
      for(const cls of selected)for(const week of cls.weeks)
        chosen.set(cls.id+':'+week.week,{cls,week});
      progresso={atual:0,total:chosen.size};atualizarProgresso();
      for(const {cls,week} of chosen.values()){
        verificarAtivo();
        const form=await lerSemana(cls,week);
        progresso.atual++;atualizarProgresso();
        if(!form.rows.length)
          status('Sem aulas: '+cls.name+' · semana '+week.week+' — ignorada (sem gravação).');
        else
          status('Lendo semana escolhida: '+cls.name+' · '+week.week);
      }
      const warnings=[];
      // Para cada semana escolhida, olhar somente para trás. Encontrar no máximo
      // cinco semanas com conteúdo REAL, sem percorrer todos os planos do ano.
      for(const cls of selected){
        for(const week of cls.weeks){
          let found=0,consulted=0;
          const previous=registroAnterior(cls,week);
          for(const old of previous){
            if(found>=5||consulted>=12)break;
            verificarAtivo();
            const key=cls.id+':'+old.week;
            const firstRead=!arquivos.has(key);
            if(firstRead)progresso.total++;
            const form=await lerSemana(cls,old);
            consulted++;
            if(temPlano(form))found++;
            if(firstRead)progresso.atual++;
            atualizarProgresso();
            status('Histórico de '+cls.name+': '+found+'/5 semanas com plano (antes da '+week.week+')');
          }
          if(found<5&&consulted>=12&&previous.length>consulted)
            warnings.push(cls.name+' · semana '+week.week+
              ': foram lidas no máximo 12 semanas anteriores; histórico com '+found+' planos efetivos.');
        }
      }
      progresso.total=progresso.atual;atualizarProgresso();
      quadroAtual.selected=selected;
      quadroAtual.historyWarnings=warnings;
      quadroAtual.overrides=new Map();
      mostrarPrevia();
      status('Sugestões prontas. Nenhum plano foi salvo.');
    }catch(error){falhar(error);}
    finally {encerrarOperacao();}
  }
  function sugerirHabilidade(history,options,stage) {
    const valid=validasParaTurma(options,stage).filter(opt=>!opt.manualOnly);
    if(!stage||!valid.length)return '';
    const recent=history.slice(0,5);
    const last=recent.find(x=>x.skill)?.skill||'';
    if(!last)return valid[0].value;
    const index=valid.findIndex(opt=>opt.value===last);
    if(index<0)return ''; // Nunca voltar ao início quando a habilidade sumiu da lista
    const count=recent.filter(x=>x.skill===last).length;
    return valid[Math.min(index+(count>=3?1:0),valid.length-1)].value;
  }
  function gerarPropostas() {
    const selected=quadroAtual.selected||[];
    const suggested=[],warnings=[...(quadroAtual.historyWarnings||[])];
    for(const cls of selected){
      const timeline=new Map();
      for(const form of arquivos.values()){
        if(form.cls.id!==cls.id||!form.week.existing||!temPlano(form))continue;
        timeline.set(form.week.week,{week:form.week.week,skill:habilidadeRecente(form),hasPlan:true});
      }
      for(const week of cls.weeks){
        const form=arquivos.get(cls.id+':'+week.week);
        if(!form){warnings.push(cls.name+' · semana '+week.week+': formulário ausente');continue;}
        if(!form.rows.length){
          warnings.push(cls.name+' · semana '+week.week+': sem aulas; ignorada automaticamente, sem preenchimento.');
          continue;
        }
        const recent=[...timeline.values()].filter(h=>h.hasPlan&&h.week<week.week)
          .sort((a,b)=>b.week-a.week).slice(0,5);
        const realExisting=habilidadeRecente(form);
        const first=form.rows.find(r=>r.kind==='science'&&!r.existingSkill&&!r.existingText);
        const proposal=realExisting||sugerirHabilidade(recent,first?.opts||[],cls.stage);
        let representative=realExisting||'';
        for(const row of form.rows){
          if(row.kind==='other'||(row.kind==='manual'&&row.existingText))continue;
          // Aulas com registro existente também aparecem na revisão;
          // a opção padrão é preservar ou complementar, nunca apagar.
          const key=cls.id+':'+week.week+':'+row.index;
          const override=quadroAtual.overrides.has(key)?quadroAtual.overrides.get(key):undefined;
          const valid=validasParaTurma(row.opts,cls.stage);
          let value=override===undefined
            ? (row.kind==='science' ? (row.existingSkill
                ? (row.hasKnowledge && (row.hasMethod || row.evaluation==='true') ? '__keep' : row.existingSkill)
                : proposal) : 'TEXT')
            : override;
          if(row.kind==='science'&&value!=='__keep'&&value&&!valid.some(opt=>opt.value===value))
            value=row.existingSkill?'__keep':'';
          const candidate=row.kind==='science'?valid.find(opt=>opt.value===value):null;
          const line={key,cls,week,row,value,options:valid,
            history:recent.map(item=>item.skill||'sem habilidade'),
            label:candidate?.label||'',manual:row.kind==='manual'};
          suggested.push(line);
          if(row.kind==='science'&&value&&value!=='__keep'&&representative==='')representative=value;
          if(row.kind==='science'&&override!==undefined&&value&&value!=='__keep')representative=value;
        }
        if(week.existing)timeline.set(week.week,{week:week.week,skill:representative||realExisting||null,hasPlan:true});
        else if(representative)timeline.set(week.week,{week:week.week,skill:representative,hasPlan:true});
      }
    }
    return {suggested,warnings};
  }
  function mostrarPrevia() {
    const result=gerarPropostas();
    quadroAtual.review=result;
    const rows=result.suggested.map(line=>{
      const {cls,week,row,value,options,history}=line;
      const select=line.manual?`<label><input type="checkbox" data-proposal-key="${html(line.key)}" ${value==='TEXT'?'checked':''}> Escrever texto padrão</label>`:
        `<select data-proposal-key="${html(line.key)}" style="min-width:260px;max-width:370px">
          <option value="" ${!value?'selected':''}>Não preencher</option>
          ${row.existingSkill?`<option value="__keep" ${value==='__keep'?'selected':''}>Manter habilidade existente</option>`:''}
          ${options.map(opt=>`<option value="${html(opt.value)}" ${opt.value===value?'selected':''}>
            ${opt.manualOnly?'⚠ ':''}${html(opt.label)}</option>`).join('')}
        </select>`;
      return `<tr><td>${html(cls.name)}</td><td>${week.week}</td><td>${row.index+1}</td>
        <td style="text-align:left">${html(row.discipline)}${row.existingSkill?' · já preenchida':''}</td>
        <td style="text-align:left">${select}</td>
        <td title="${html(history.join(' → '))}" style="font-size:11px;color:#63768a">${html(history.filter(Boolean).slice(0,3).join(', ')||'Sem histórico')}</td></tr>`;
    }).join('');
    const existing=$('#seges-v3-overlay');
    const root=modal(`<h3>Conferir antes de preencher</h3>
      <p class="hint">Nenhuma gravação foi feita. As habilidades são sugeridas com base nas <strong>cinco semanas anteriores com plano</strong>, sem percorrer todas as semanas. As escolhas nesta tabela são revisáveis.</p>
      <div class="scroll"><table><thead><tr><th>Turma</th><th>Semana</th><th>Aula</th><th>Disciplina</th><th>Habilidade / ação</th><th>Últimos planos</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="hint" id="seges-v3-warning">${result.warnings.length?html(result.warnings.join(' | ')):''}</p>
      <p id="seges-v3-message" class="hint">${result.suggested.length} aula(s) encontradas. Semanas sem aulas são ignoradas automaticamente e não recebem salvamento. As opções com ⚠ não têm código de etapa reconhecido.</p>
      <div class="actions">
        <button id="seges-v3-back">Voltar à tabela</button>
        <button id="seges-v3-cancel" class="danger">Cancelar</button>
        <button id="seges-v3-approve" class="primary">Aprovar e preencher</button>
      </div>`);
    if(existing&&existing!==root)existing.remove();
    $('#seges-v3-back').onclick=()=>{quadroAtual.review=null;abrirTabelaSemRecarregar();};
    $('#seges-v3-cancel').onclick=cancelar;
    $('#seges-v3-approve').onclick=()=>aprovarEExecutar().catch(falhar);
    root.onchange=e=>{
      const control=e.target.closest('[data-proposal-key]');if(!control)return;
      const scroller=$('.scroll',root);
      const previousTop=scroller?.scrollTop||0,previousLeft=scroller?.scrollLeft||0;
      const key=control.dataset.proposalKey;
      quadroAtual.overrides.set(key,control.type==='checkbox'?(control.checked?'TEXT':''):control.value);
      mostrarPrevia();
      const newScroll=$('.scroll',$('#seges-v3-overlay'));
      if(newScroll){newScroll.scrollTop=previousTop;newScroll.scrollLeft=previousLeft;}
    };
  }
  function abrirTabelaSemRecarregar(){
    const root=modal(`<h3>Escolher turmas e semanas</h3><p class="hint">Ajuste as células e revise novamente.</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><label>Semanas por turma <select id="seges-v3-quantity"><option>2</option><option>3</option><option>4</option><option>1</option></select></label>
      <button id="seges-v3-reselect">Marcar próximas pendentes</button><label><input id="seges-v3-existing" type="checkbox"> Mostrar semanas com plano</label>
      <strong id="seges-v3-count"></strong></div><div id="seges-v3-grid"></div><p id="seges-v3-message" class="hint"></p>
      <div class="actions"><button id="seges-v3-cancel" class="danger">Cancelar</button>
      <button id="seges-v3-preview" class="primary">Ver sugestões</button></div>`);
    $('#seges-v3-reselect').onclick=()=>{sugerirSemanas(Number($('#seges-v3-quantity').value));atualizarTabela();};
    $('#seges-v3-quantity').onchange=()=>{sugerirSemanas(Number($('#seges-v3-quantity').value));atualizarTabela();};
    $('#seges-v3-existing').onchange=atualizarTabela;
    $('#seges-v3-cancel').onclick=cancelar;
    $('#seges-v3-preview').onclick=()=>prepararPrevia().catch(falhar);
    atualizarTabela();
  }
  async function aprovarEExecutar() {
  if(ativo)return;
  const proposal=quadroAtual?.review?.suggested||[];
  const actions=proposal.filter(item=>item.value && item.value!=='__keep' && (!item.manual||item.row.manualText));
  const replacements=actions.filter(item=>!item.manual && item.row.existingSkill && item.value!==item.row.existingSkill);
  if(!actions.length){alert('Nenhum campo foi selecionado para preencher.');return;}
  const unresolved=proposal.filter(item=>!item.manual&&!item.value&&!item.row.existingSkill);
  const changedUnknown=actions.filter(item=>!item.manual && item.options.find(o=>o.value===item.value)?.manualOnly);
  let message='Confirmar '+actions.length+' aula(s) de '+new Set(actions.map(a=>a.cls.id)).size+
    ' turma(s), distribuídas em '+new Set(actions.map(a=>a.cls.id+':'+a.week.week)).size+' semana(s)?';
  if(unresolved.length)message+='\n\n'+unresolved.length+' aula(s) ficarão sem preencher porque você não selecionou uma habilidade.';
  if(replacements.length)message+='\n\nATENÇÃO: '+replacements.length+' habilidade(s) já registradas serão substituídas.';
  if(changedUnknown.length)message+='\n\nATENÇÃO: '+changedUnknown.length+' habilidade(s) não têm código curricular que confirme a etapa. Você escolheu manualmente.';
  message+='\n\nEsta operação será executada nesta guia, sem salvar progresso. Fechar a guia ou clicar Parar encerra a automação.';
  if(!confirm(message))return;
  iniciarOperacao();
  const groups=quadroAtual.selected.filter(cls=>actions.some(a=>a.cls.id===cls.id));
  const byKey=new Map();
  for(const action of actions){
    const k=action.cls.id+':'+action.week.week;
    if(!byKey.has(k))byKey.set(k,{cls:action.cls,week:action.week,items:[]});
    byKey.get(k).items.push(action);
  }
  operacaoAtual={byKey,finished:[],failed:[],startedAt:new Date(),planned:actions.length};
  progresso={atual:0,total:byKey.size};atualizarProgresso();
  modal(`<h3>Preenchendo planos aprovados</h3>
    <p class="hint">A automação está nesta guia. Fechá-la encerra a execução, sem guardar progresso para retomada.</p>
    <strong id="seges-v3-working">Preparando...</strong>
    <div style="height:11px;background:#e4ecf2;border-radius:8px;overflow:hidden;margin:12px 0">
      <div id="seges-v3-working-fill" style="height:100%;width:0;background:#17699e"></div>
    </div>
    <div id="seges-v3-message" class="hint"></div>
    <div class="actions"><button id="seges-v3-stopnow" class="danger">Parar agora</button></div>`);
  $('#seges-v3-stopnow').onclick=cancelar;
  try{
    for(const group of byKey.values()){
      verificarAtivo();
      const text=group.cls.name+' · semana '+group.week.week;
      $('#seges-v3-working').textContent=text;
      status('Aplicando '+text+' ('+(progresso.atual+1)+'/'+progresso.total+')');
      await aplicarSemanaAprovada(group);
      operacaoAtual.finished.push(text);
      progresso.atual++;atualizarProgresso();
      const bar=$('#seges-v3-working-fill');if(bar)bar.style.width=Math.round(100*progresso.atual/progresso.total)+'%';
    }
    verificarAtivo();
    ultimoRelatorio={at:new Date(),finished:operacaoAtual.finished.slice(),failed:[],totalLessons:actions.length};
    status('Concluído: '+operacaoAtual.finished.length+' semana(s) verificadas. O relatório vale apenas para esta guia.');
    encerrarOperacao();
    iframe?.remove();iframe=null;
    const lines=ultimoRelatorio.finished.map(x=>'<li>'+html(x)+'</li>').join('');
    modal(`<h3>Concluído — planos verificados</h3>
      <p>O SEGES confirmou os registros listados abaixo. Nada foi guardado como progresso.</p>
      <div style="max-height:50vh;overflow:auto"><ul>${lines}</ul></div>
      <div class="actions"><button id="seges-v3-export">Baixar relatório TXT</button>
        <button id="seges-v3-close">Fechar</button></div>`);
    $('#seges-v3-export').onclick=()=>baixar('seges-planos-verificados.txt',
      'Planos verificados\n'+ultimoRelatorio.finished.join('\n')+'\n');
    $('#seges-v3-close').onclick=fecharModal;
  }catch(error){
    if(cancelado)return;
    const failed=String(error?.message||error);
    operacaoAtual?.failed.push({reason:failed});
    status('Interrompido sem novas tentativas: '+failed);
    encerrarOperacao();
    iframe?.remove();iframe=null;
    modal(`<h3>Execução interrompida</h3>
      <p style="color:#a02f35">${html(failed)}</p>
      <p class="hint">O último formulário pode ter sido salvo ou recusado. Confira diretamente no SEGES antes de repetir. Sem retomada automática.</p>
      <p>Semanas verificadas antes da interrupção: ${operacaoAtual?.finished?.length||0}</p>
      <div class="actions"><button id="seges-v3-export">Baixar log</button><button id="seges-v3-close">Fechar</button></div>`);
    $('#seges-v3-export').onclick=()=>baixar('seges-erro.txt',linhasLog.join('\n'));
    $('#seges-v3-close').onclick=fecharModal;
  }
}

  function alertaDoSeges(doc) {
  return $$('.alert-danger, .alert.alert-error, #error_explanation, .invalid-feedback',doc)
    .map(el=>String(el.textContent||'').trim()).filter(Boolean).join(' | ').slice(0,1200);
}

  function verificarAulasNaoMudaram(group,doc) {
  const rows=$$('#weekly_plan tr.by-curriculum-discipline',doc);
  if(!rows.length)throw Error('O formulário mudou ou perdeu as aulas antes do salvamento. Nenhuma gravação será feita.');
  for(const action of group.items){
    const original=action.row,actual=rows[original.index];
    if(!actual)throw Error('Aula '+(original.index+1)+' desapareceu do formulário.');
    const discipline=String(actual.querySelectorAll('td')[1]?.textContent||'').trim();
    if(normal(discipline)!==normal(original.discipline))
      throw Error('A disciplina da aula '+(original.index+1)+' mudou. Nova conferência necessária.');
    if(!action.manual){
      const real=opcoesDaAula(actual);
      if(!real.some(option=>option.value===action.value))
        throw Error('A habilidade '+action.value+' não consta mais no dropdown da aula '+(original.index+1)+'.');
      const actualValue=String($('.structured-weekly-plan-id-select',actual)?.value||'');
      if(actualValue!==original.existingSkill)
        throw Error('O registro da aula '+(original.index+1)+' mudou depois da revisão.');
    }
  }
}

  async function frameAbrir(href) {
  verificarAtivo();
  const url=urlSeges(href);
  if(!url)throw Error('Endereço de formulário inválido.');
  if(!iframe){
    iframe=document.createElement('iframe');
    iframe.setAttribute('aria-hidden','true');
    iframe.style.cssText='position:absolute;left:-12000px;top:-12000px;width:1280px;height:960px;opacity:0;pointer-events:none;border:0';
    document.body.appendChild(iframe);
  }
  const frame=iframe;
  await new Promise((resolve,reject)=>{
    let timer;
    const onload=()=>{
      try{
        const doc=frame.contentDocument;
        if(!doc || frame.contentWindow.location.href==='about:blank')return;
        clearTimeout(timer);frame.removeEventListener('load',onload);resolve();
      }catch(error){clearTimeout(timer);frame.removeEventListener('load',onload);reject(Error('O SEGES bloqueou o formulário dentro da guia. '+error.message));}
    };
    timer=setTimeout(()=>{
      frame.removeEventListener('load',onload);
      reject(Error('O formulário não abriu nesta guia. Talvez o SEGES bloqueie iframes; nenhuma gravação foi feita.'));
    },15000);
    frame.addEventListener('load',onload);
    frame.src=url.href;
  });
  verificarAtivo();
  const doc=frame.contentDocument;
  if(!doc || !$('#weekly_plan',doc)){
    const message=doc?alertaDoSeges(doc):'';
    throw Error('Formulário não encontrado após abertura. '+message);
  }
  return doc;
}

  async function esperarElemento(fn,timeoutMs=5000){
  const began=Date.now();
  while(Date.now()-began<timeoutMs){
    verificarAtivo();
    const value=fn();if(value)return value;
    await dormir(120);
  }
  return null;
}

  function selecionarExato(select,value,label) {
  if(!select)throw Error(label+': campo ausente.');
  const opt=Array.from(select.options||[]).find(opt=>String(opt.value)===String(value));
  if(!opt)throw Error(label+': opção não disponível no SEGES.');
  if(select.multiple)Array.from(select.options).forEach(o=>o.selected=o===opt);
  else select.value=String(value);
  const view=select.ownerDocument.defaultView;
  select.dispatchEvent(new view.Event('input',{bubbles:true}));
  select.dispatchEvent(new view.Event('change',{bubbles:true}));
  if(view.jQuery){
    try{
      const jq=view.jQuery(select);
      jq.trigger('change');
      jq.trigger('change.select2');
    }catch(_){}
  }
  if(select.multiple?!Array.from(select.selectedOptions).some(o=>o.value===value):select.value!==String(value))
    throw Error(label+': o campo rejeitou a seleção.');
}

  async function escolherDependente(block,selector,candidate,label){
  if(!candidate)return;
  const select=await esperarElemento(()=>$ (selector,block),3000);
  if(!select)throw Error(label+': campo não existe na aula.');
  const find=()=>Array.from(select.options||[]).find(opt=>
    String(opt.value)===String(candidate)||normal(opt.textContent)===normal(candidate));
  const option=await esperarElemento(find,5000);
  if(!option)throw Error(label+': a opção prevista não apareceu no SEGES.');
  if(!Array.from(select.selectedOptions||[]).some(opt=>opt.value))selecionarExato(select,option.value,label);
}

  async function aplicarAulaNoFrame(group,action,doc) {
  verificarAtivo();
  const tr=$$('#weekly_plan tr.by-curriculum-discipline',doc)[action.row.index];
  if(action.manual){
    const field=$('textarea',tr);
    if(!field)throw Error('Campo de texto ausente: aula '+(action.row.index+1));
    if(!String(field.value||'').trim()){
      field.value=action.row.manualText;
      field.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));
      field.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));
    }
    return;
  }
  const before=action.row.existingSkill||'';
  let block=$$('.structured-weekly-plan-id-select',tr)
    .map(el=>el.closest('.nested-fields')||el.parentElement)
    .find(el=>{
      const value=String($('.structured-weekly-plan-id-select',el)?.value||'');
      return value===action.value || (before&&value===before) || !value;
    });
  if(!block && before)throw Error('A habilidade existente não foi localizada na aula '+(action.row.index+1));
  if(!block){
    const add=$('.add_fields',tr);
    if(!add)throw Error('O SEGES não oferece botão para incluir habilidade nesta aula.');
    const previous=$$('.structured-weekly-plan-id-select',tr).length;
    add.click();
    block=await esperarElemento(()=>{
      const all=$$('.structured-weekly-plan-id-select',tr);
      if(all.length<=previous)return null;
      return all.at(-1).closest('.nested-fields')||all.at(-1).parentElement;
    },5000);
    if(!block)throw Error('O SEGES não criou o campo estruturado da aula.');
  }
  let selector=$('.structured-weekly-plan-id-select',block);
  if(!selector)throw Error('Lista curricular ausente na aula.');
  const old=String(selector.value||'');
  if(old&&old!==action.value && old!==before)
    throw Error('Uma habilidade diferente da aprovada está na aula.');
  if(old!==action.value){
    selecionarExato(selector,action.value,'Habilidade');
    await dormir(300);
  }
  verificarAtivo();
  const choice=action.options.find(opt=>opt.value===action.value);
  if(!choice)throw Error('Habilidade não aprovada na prévia.');
  if(old&&old!==action.value){
    for(const key of ['.structured-weekly-plan-knowledges-select','.structured-weekly-plan-methodologies-select']){
      const field=$(key,block);
      if(field){
        Array.from(field.options||[]).forEach(opt=>opt.selected=false);
        field.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));
      }
    }
  }
  await escolherDependente(block,'.structured-weekly-plan-knowledges-select',choice.knowledges?.[0]||'','Objeto de conhecimento');
  await escolherDependente(block,'.structured-weekly-plan-methodologies-select',choice.methodologies?.[0]||'','Metodologia');
  const evaluation=$('.structured-weekly-plan-evaluation-select',block);
  if(evaluation&&!evaluation.value&&Array.from(evaluation.options||[]).some(o=>o.value==='false'))
    selecionarExato(evaluation,'false','Avaliação');
}

  async function clicarSalvarUmaVez(doc) {
  const save=$('input[type="submit"][value="Salvar"],input[name="commit"][value="Salvar"],button[type="submit"]',doc);
  if(!save)throw Error('O botão Salvar não foi encontrado. Nenhum envio executado.');
  const error=alertaDoSeges(doc);
  if(error)throw Error('O SEGES indica erro antes de salvar: '+error);
  verificarAtivo();
  // Registra ouve a navegação ANTES de clicar. Nunca repete o clique.
  const frame=iframe;
  const result=new Promise(resolve=>{
    let done=false;
    const finish=(outcome)=>{
      if(done)return;done=true;
      clearTimeout(timeout);frame.removeEventListener('load',loaded);
      resolve(outcome);
    };
    const loaded=()=>finish({navigated:true});
    const timeout=setTimeout(()=>finish({navigated:false}),15000);
    frame.addEventListener('load',loaded);
  });
  save.click();
  const resultValue=await result;
  verificarAtivo();
  if(!resultValue.navigated){
    const current=iframe?.contentDocument;
    throw Error('O SEGES não confirmou o retorno após Salvar. '+(current?alertaDoSeges(current):'')+
      ' Confira manualmente; não haverá nova tentativa.');
  }
  const current=iframe?.contentDocument;
  if(!current)throw Error('O SEGES bloqueou o retorno do salvamento.');
  const resultError=alertaDoSeges(current);
  if(resultError)throw Error('Erro retornado pelo SEGES: '+resultError);
}

  async function confirmarRegistro(group) {
  const list=await buscarPagina(group.cls.url);
  const refreshed=semanasDisponiveis(list,group.cls).find(item=>item.week===group.week.week);
  if(!refreshed?.existing)
    throw Error('A semana '+group.week.week+' ainda aparece sem plano. Salvamento não confirmado.');
  const saved=await buscarPagina(refreshed.url);
  const rows=lerAulas(saved,group.cls,refreshed);
  for(const action of group.items){
    const row=rows[action.row.index];
    if(!row)throw Error('A aula não apareceu no plano salvo.');
    if(action.manual){
      if(!row.existingText)throw Error('O texto da aula não foi encontrado após salvar.');
    } else if(row.existingSkill!==action.value){
      throw Error('O SEGES devolveu outra habilidade para a aula '+(row.index+1)+'.');
    }
  }
}

  async function aplicarSemanaAprovada(group) {
  const doc=await frameAbrir(group.week.url);
  verificarAtivo();
  verificarAulasNaoMudaram(group,doc);
  const currentError=alertaDoSeges(doc);if(currentError)throw Error('Erro no formulário: '+currentError);
  for(const action of group.items){
    verificarAtivo();
    await aplicarAulaNoFrame(group,action,doc);
  }
  verificarAtivo();
  await clicarSalvarUmaVez(doc);
  verificarAtivo();
  await confirmarRegistro(group);
  log('Salvo e verificado: '+group.cls.name+' · semana '+group.week.week);
}
  function identificarExcluir(doc) {
  const forms=$$('form',doc);
  for(const form of forms){
    const override=String($('input[name="_method"]',form)?.value||'').toLowerCase();
    const method=String(form.getAttribute('method')||'GET').toUpperCase();
    if(override!=='delete'&&method!=='DELETE')continue;
    const url=urlSeges(form.getAttribute('action')||'');
    if(!url||!/^\/weekly_plans\/\d+\/?$/.test(url.pathname))continue;
    const fields=$$('input[name]',form)
      .filter(input=>!input.disabled && (!['checkbox','radio'].includes(input.type)||input.checked))
      .map(input=>[input.name,input.value]);
    return {url:url.href,method:method==='DELETE'?'DELETE':'POST',fields,
      csrf:$('meta[name="csrf-token"]',doc)?.content||''};
  }
  for(const link of $$('a[data-method],a[data-turbo-method],button[data-method]',doc)){
    if(String(link.dataset.method||link.getAttribute('data-turbo-method')||'').toLowerCase()!=='delete')continue;
    const url=urlSeges(link.getAttribute('href')||link.getAttribute('formaction')||'');
    if(!url||!/^\/weekly_plans\/\d+\/?$/.test(url.pathname))continue;
    return {url:url.href,method:'DELETE',fields:[],
      csrf:$('meta[name="csrf-token"]',doc)?.content||''};
  }
  return null;
}

  async function comandoExcluir(week){
  const rowDoc=new DOMParser().parseFromString('<table><tbody>'+week.rowHtml+'</tbody></table>','text/html');
  let control=identificarExcluir(rowDoc);
  if(!control){
    const detail=await buscarPagina(week.url);
    control=identificarExcluir(detail);
  }
  if(!control)throw Error('O SEGES não apresentou um botão oficial para excluir a semana '+week.week+'.');
  const actual=urlSeges(control.url)?.pathname.match(/^\/weekly_plans\/(\d+)\/?$/)?.[1];
  const listed=urlSeges(week.url)?.pathname.match(/^\/weekly_plans\/(\d+)(?:\/edit)?\/?$/)?.[1];
  if(!actual||actual!==listed)throw Error('O comando de exclusão não corresponde ao plano escolhido.');
  return control;
}

  async function executarExclusaoOficial(control){
  verificarAtivo();
  const csrf=control.csrf||$('meta[name="csrf-token"]')?.content||'';
  const fields=new URLSearchParams();
  for(const [key,value] of control.fields)fields.append(key,value);
  if(!csrf&&!fields.has('authenticity_token'))throw Error('Token de segurança do SEGES ausente.');
  const headers={'Accept':'text/html,application/json','X-Requested-With':'XMLHttpRequest'};
  if(csrf)headers['X-CSRF-Token']=csrf;
  const options={method:control.method,credentials:'same-origin',signal:controller.signal,redirect:'follow',headers};
  if(control.method==='POST'){
    options.body=fields;
    headers['Content-Type']='application/x-www-form-urlencoded;charset=UTF-8';
  }
  const response=await fetch(control.url,options);
  verificarAtivo();
  const returned=urlSeges(response.url);
  if(!response.ok||!returned)throw Error('Falha ou redirecionamento inesperado ao excluir (HTTP '+response.status+').');
}

  async function verificarExclusao(week,cls){
  const doc=await buscarPagina(cls.url);
  if(!$('table.table.table-striped',doc))throw Error('Não encontrei a lista de semanas para verificar a exclusão.');
  const weeks=semanasDisponiveis(doc,cls);
  const originalId=urlSeges(week.url)?.pathname.match(/^\/weekly_plans\/(\d+)(?:\/edit)?\/?$/)?.[1];
  return !weeks.some(w=>w.week===week.week&&w.existing&&
    urlSeges(w.url)?.pathname.match(/^\/weekly_plans\/(\d+)(?:\/edit)?\/?$/)?.[1]===originalId);
}

  async function abrirExclusoes() {
  iniciarOperacao();
  const root=modal(`<h3>Excluir planos — várias turmas</h3>
    <p class="hint"><strong>Atenção:</strong> a exclusão é permanente. Marque exatamente os registros existentes que deseja remover.</p>
    <div id="seges-v3-del-table">Consultando turmas...</div>
    <p id="seges-v3-message" class="hint"></p>
    <div class="actions"><button id="seges-v3-del-cancel" class="danger">Cancelar</button>
      <button id="seges-v3-del-apply" disabled>Excluir planos marcados</button></div>`);
  $('#seges-v3-del-cancel').onclick=cancelar;
  const map=new Map();
  try{
    const main=location.pathname===BASE&&!location.search?document:await buscarPagina(BASE);
    const classes=turmasDisponiveis(main);
    if(!classes.length)throw Error('Nenhuma turma encontrada.');
    progresso={atual:0,total:classes.length};atualizarProgresso();
    for(const cls of classes){
      verificarAtivo();
      const doc=await buscarPagina(cls.url);
      map.set(cls.id,{cls,weeks:semanasDisponiveis(doc,cls).filter(w=>w.existing)});
      progresso.atual++;atualizarProgresso();
      status('Consultando planos: '+progresso.atual+'/'+classes.length);
    }
    const all=[...new Set([...map.values()].flatMap(x=>x.weeks.map(w=>w.week)))].sort((a,b)=>a-b);
    const rows=[...map.values()].map(({cls,weeks})=>{
      const weekMap=new Map(weeks.map(w=>[w.week,w]));
      return `<tr><td><strong>${html(cls.name)}</strong></td>
        ${all.map(n=>weekMap.has(n)?
          `<td><input type="checkbox" data-excluir-class="${html(cls.id)}" data-excluir-week="${n}"></td>`:
          '<td>·</td>').join('')}</tr>`;
    }).join('');
    $('#seges-v3-del-table').innerHTML=`<div class="scroll"><table><thead><tr><th>Turma</th>${all.map(n=>`<th>${n}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table></div><p class="hint">Somente planos que já existem no SEGES aparecem com caixas de seleção.</p>`;
    const btn=$('#seges-v3-del-apply');
    btn.disabled=!all.length;
    btn.classList.add('danger');
    encerrarOperacao();
    btn.onclick=async()=>{
      const checked=$$('[data-excluir-week]:checked',root);
      if(!checked.length){alert('Marque pelo menos um plano.');return;}
      const selected=checked.map(el=>{
        const c=map.get(el.dataset.excluirClass);
        const w=c?.weeks.find(x=>x.week===Number(el.dataset.excluirWeek));
        return w?{cls:c.cls,week:w}:null;
      }).filter(Boolean);
      const phrase='EXCLUIR '+selected.length;
      const answer=prompt('Você selecionou '+selected.length+' planos de '+new Set(selected.map(x=>x.cls.id)).size+
        ' turma(s).\n\nA exclusão é permanente. Digite exatamente '+phrase+' para confirmar:');
      if(answer!==phrase)return;
      iniciarOperacao();
      progresso={atual:0,total:selected.length};atualizarProgresso();
      btn.disabled=true;
      const results=[];
      try{
        for(const {cls,week} of selected){
          verificarAtivo();
          status('Excluindo '+cls.name+' · semana '+week.week);
          const command=await comandoExcluir(week);
          await executarExclusaoOficial(command);
          if(!await verificarExclusao(week,cls))
            throw Error('O SEGES respondeu, mas não foi possível confirmar a exclusão desta semana. Confira manualmente.');
          results.push(cls.name+' · semana '+week.week);
          progresso.atual++;atualizarProgresso();
          log('Exclusão verificada: '+results.at(-1));
        }
        encerrarOperacao();
        modal(`<h3>Exclusões verificadas</h3><p>${results.length} planos foram removidos e conferidos na lista do SEGES.</p>
          <div class="scroll">${results.map(x=>'<div style="padding:5px">'+html(x)+'</div>').join('')}</div>
          <div class="actions"><button id="seges-v3-download">Baixar relatório TXT</button>
          <button id="seges-v3-done">Fechar</button></div>`);
        $('#seges-v3-download').onclick=()=>baixar('seges-exclusoes.txt',results.join('\n'));
        $('#seges-v3-done').onclick=fecharModal;
      }catch(error){
        if(cancelado)return;
        status('Exclusão interrompida: '+error.message);
        encerrarOperacao();
        modal(`<h3>Exclusão interrompida</h3><p style="color:#af3333">${html(error.message)}</p>
          <p>Exclusões verificadas antes da interrupção: ${results.length}.
          Não tente novamente sem conferir os registros no SEGES.</p>
          <div class="actions"><button id="seges-v3-done">Fechar</button></div>`);
        $('#seges-v3-done').onclick=fecharModal;
      }
    };
  }catch(error){falhar(error);}
  finally{if(ativo)encerrarOperacao();}
}
  // Eliminar os dados de retomada deixados por versões anteriores.
  // Esta versão não lê nem grava progresso no navegador.
  try {
    ['vm_plano_semanal_automacao_v1','vm_plano_semanal_report_open',
     'vm_plano_semanal_panel_position','vm_plano_semanal_panel_log_visible']
      .forEach(key=>localStorage.removeItem(key));
  } catch (_) {}
  painel();
  if(location.pathname!==BASE)status('Abra a lista de turmas em Planos Semanais para iniciar.');
}
})();
