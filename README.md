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

## Plano Semanal — preenchimento seletivo e gerenciador de exclusões v1.6.0

**Instalar:** [SEGES/plano-semanal.user.js](SEGES/plano-semanal.user.js)

**Ao atualizar de uma versão anterior:** substitua o código no Tampermonkey, desative cópias antigas e, se houver uma execução antiga em andamento, use **Parar e limpar** antes de iniciar o novo processamento. A versão 1.6 não retoma estados salvos pela 1.4 para evitar mudanças inesperadas.

### Preencher apenas as lacunas

1. Abra o SEGES na **lista de semanas da turma**.
2. No painel do script, clique em **Selecionar semanas**.
3. Marque as semanas que deseja completar (ou use **Todas**, **Nenhuma**, **Só semanas sem plano**).
4. Clique em **Mapear e completar selecionadas**.
5. O script examina **todas as semanas da turma** para identificar habilidades já registradas, mas só gera complementos para as semanas selecionadas.
6. Para as disciplinas textuais, não substitui textos preenchidos. Para Ciências/Biologia, preserva habilidades registradas e tenta completar apenas objetos e metodologias ausentes. Sem habilidade compatível, registra a ocorrência no log e não inventa uma correspondência.

O algoritmo distribui habilidades disponíveis priorizando as menos usadas, com menor repetição entre semanas. A ordem curricular serve de desempate. As aulas já registradas não são eliminadas, e as semanas sem lacunas são ignoradas durante a aplicação.

### Excluir planos de várias turmas

1. Abra o menu **Planos Semanais** no SEGES.
2. Clique em **Gerenciar exclusões** no painel.
3. Marque uma ou mais turmas e clique em **Consultar semanas selecionadas**.
4. Marque individualmente os planos existentes que deseja remover.
5. Clique em **Excluir planos marcados** e digite a confirmação exata exigida na tela.

O script **não inventa o endereço da operação de exclusão**: antes de cada tentativa, procura um formulário ou comando `DELETE` existente no HTML do próprio SEGES, confirma que pertence ao registro escolhido e usa a sessão autenticada. Depois, consulta novamente a lista para verificar a remoção. Se a interface não expuser um comando compatível, **não exclui** e informa a falha. Se o servidor responder mas a alteração não puder ser verificada, registra como **não confirmada**, nunca como sucesso. O histórico dessa operação pode ser exportado em TXT.

### Recursos preservados

- Painel arrastável, com posição lembrada ao navegar;
- Turma e semana atual;
- Barra de progresso em duas etapas (mapeamento e aplicação);
- Log expansível e exportação TXT;
- Retomada automática e relatório CSV/JSON;
- Textos pedagógicos das disciplinas e lógica de seleção de campos do SEGES.

**Limitações:** o programa depende dos elementos HTML e dos comandos disponíveis para a conta autenticada no SEGES. Foi verificada a sintaxe do JavaScript e o cálculo de distribuição em cenários simulados. **Ainda não houve teste de preenchimento ou exclusão no ambiente real.** Revise cuidadosamente uma turma e poucas semanas antes do uso amplo, especialmente porque exclusões são irreversíveis.

**Versão original enviada:** [SEGES/arquivo/plano-semanal-v1.3.2-original.user.js](SEGES/arquivo/plano-semanal-v1.3.2-original.user.js). Também é possível recuperar a versão 1.4.0 pelo histórico de commits do GitHub.
