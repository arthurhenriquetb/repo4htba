# Scripts SEGES

Coleção de scripts de automação para o [SEGES/SEDU-ES](https://seges.sedu.es.gov.br/absences), executados no navegador pelo Tampermonkey.

## Validação automática v6.2

**Arquivo para instalar:** [SEGES/validacao-automatica.user.js](SEGES/validacao-automatica.user.js)

### Recursos
- Painel à direita, arrastável pelo cabeçalho;
- Turma atual exibida durante a execução;
- Barra de progresso por combinação de turma e mês, com avanços intermediários por disciplina;
- Botão para mostrar/ocultar o log e exportá-lo como TXT;
- Relatório final com dias em que o modal do SEGES **indica explicitamente** ausência de plano semanal;
- Lista separada de datas que não puderam ser confirmadas e exigem verificação manual;
- Identificação de turmas, meses, disciplinas e dias no log;
- Manutenção da seleção por nome da disciplina, independentemente da ordem no menu.

### Instalação

1. Instale a extensão **Tampermonkey** no navegador.
2. Abra o arquivo **validacao-automatica.user.js** acima e clique em **Raw**, para mostrar apenas o código.
3. Abra o painel do Tampermonkey, escolha **Criar novo script**, apague o exemplo, cole todo o código copiado e salve com **Ctrl+S**.
4. Desative a versão anterior, se estiver instalada, para evitar painéis e validações duplicados.
5. Acesse ou recarregue a página **https://seges.sedu.es.gov.br/absences**.

### Uso

Selecione as turmas e os meses e clique em **Iniciar**. Arraste o painel pelo título **SEGES • Validação**. Abra **Mostrar log** para acompanhar as etapas e, se desejar, baixe o histórico por **Baixar log (.txt)**.

### Como interpretar o resultado

O script inspeciona somente as datas pendentes mostradas pelo SEGES em `thead a.cell-warning`. A falta de plano semanal é informada quando o texto do modal declara essa ausência. A falta do botão **Sim**, sozinha, não comprova ausência de planejamento: essas datas são registradas para revisão manual. Por isso, **“nenhum dia sem plano identificado” não é uma auditoria completa de todos os dias letivos**.

O percentual da barra é calculado pelas combinações selecionadas de **turma × mês**, com avanço parcial por disciplina. Meses ausentes do menu são registrados no log e contabilizados no avanço.

O script executa ações em registros oficiais. Confira o relatório e verifique manualmente as exceções. **A sintaxe foi validada, mas o comportamento no ambiente autenticado do SEGES não pôde ser testado nesta sessão.**

## Histórico

Versão original preservada em [SEGES/arquivo/validacao-automatica-v6.1-original.js](SEGES/arquivo/validacao-automatica-v6.1-original.js), apenas como arquivo histórico. Não instale as duas versões simultaneamente.

## Plano Semanal — preenchimento automático v1.4.0

**Script para instalar:** [SEGES/plano-semanal.user.js](SEGES/plano-semanal.user.js)

- Conserva a distribuição de habilidades de Ciências/Biologia e os textos predefinidos para disciplinas específicas;
- Conserva a retomada da automação e o relatório exportável em CSV/JSON;
- Exibe a turma pelo nome, se o próprio SEGES disponibilizar esse dado; caso contrário, exibe o identificador (ID);
- Exibe barra de progresso em duas fases: mapeamento das semanas (0–50%) e preenchimento (50–100%);
- Permite mover o painel pelo cabeçalho, lembrando a posição entre páginas;
- Permite mostrar/ocultar os últimos eventos do log e exportar o histórico completo como TXT;
- Restringe a execução ao domínio oficial `seges.sedu.es.gov.br`.

**Instalação:** no Tampermonkey, crie um script novo, copie o conteúdo do arquivo [plano-semanal.user.js](SEGES/plano-semanal.user.js), salve com **Ctrl+S** e desative a versão antiga desse script. O script aparece nas páginas de planos semanais do SEGES.

**Atenção:** o indicador conta semanas processadas em cada fase; não mede o sucesso da gravação no servidor. O relatório reúne instruções planejadas, devendo ser conferido no SEGES. A sintaxe JavaScript foi validada e as contas de progresso foram testadas, mas não houve teste na sessão autenticada do sistema.

**Cópia da versão recebida:** [SEGES/arquivo/plano-semanal-v1.3.2-original.user.js](SEGES/arquivo/plano-semanal-v1.3.2-original.user.js).
