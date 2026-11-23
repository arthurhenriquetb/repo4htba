// ==UserScript==
// @name         SEGES - Validação Automática v6.1
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Varre turmas, meses e todas as disciplinas disponíveis e valida automaticamente os conteúdos ministrados.
// @author       Prof. Arthur
// @match        https://seges.sedu.es.gov.br/absences*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TIMEOUT = 15000;
    const POLL = 200;

    let executando = false;
    let pararSolicitado = false;

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
            left: 12px;

            width: 300px;

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

            iniciar.disabled = true;

            iniciar.textContent =
                'Processando...';

            try {

                await executarProcesso(
                    selecao.turmas,
                    selecao.meses
                );

                if (!pararSolicitado) {

                    atualizarStatus(
                        '✓ Tudo concluído.'
                    );

                    alert(
                        'Validação concluída!'
                    );
                }

            } catch (erro) {

                console.error(
                    'SEGES v6.1:',
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

        console.log(
            'SEGES v6.1:',
            texto
        );
    }

    // =========================================================
    // SELECIONAR TURMA
    // =========================================================

    async function selecionarTurma(nome) {

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

    if (botaoSim) {

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
        }).catch(() => {});

        await wait(700);

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

    console.log(
        `SEGES: dia ${texto} fechado sem validação.`
    );
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
    await wait(500);
    continue;
}

await selecionarTodasDisciplinas();

                if (pararSolicitado) return;

                await validarDatas();

                await wait(700);
            }
        }
    }

    // =========================================================
    // INICIAR
    // =========================================================

    window.addEventListener(
        'load',
        async () => {

            try {

                await wait(1000);

                criarPainel();

            } catch (erro) {

                console.error(
                    'SEGES v6.1:',
                    erro
                );

                alert(
                    'Erro ao iniciar o bot:\n\n' +
                    erro.message
                );
            }
        }
    );

})();