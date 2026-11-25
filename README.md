# SEGES • Assistente

**Um único userscript para Violentmonkey**, com módulos detectados automaticamente nas telas do SEGES/SEDU-ES. A versão principal é **3.3.0**.

**Arquivo para instalar:** [SEGES/assistente-seges.user.js](SEGES/assistente-seges.user.js)

## Instalação ou atualização

1. Abra o arquivo principal acima no GitHub e clique em **Raw**.
2. Copie todo o conteúdo do código.
3. Abra o **Violentmonkey** e edite o script *SEGES • Assistente* já instalado (ou crie um novo).
4. Substitua o código anterior pelo código copiado e salve com **Ctrl + S**.
5. **Desative todas as versões antigas/duplicadas** de scripts do SEGES.
6. Recarregue a página do SEGES.

## Planos semanais: interface nova (v3)

Na lista de Planos Semanais (`/weekly_plans`), clique em **Preencher planos**. O programa abre **uma única tabela**, com turmas nas linhas e semanas nas colunas.

- As próximas **2 semanas sem plano, depois da última semana planejada**, são marcadas automaticamente em cada turma.
- Use o seletor **Semanas por turma** para trocar para **3, 4 ou 1** de uma vez.
- Clique no marcador junto ao nome da turma para incluir ou excluir a turma inteira com um clique.
- Marque ou desmarque células para escolher semanas específicas; marque **Mostrar semanas com plano** para incluir semanas já existentes quando precisar complementar.
- Se o ano/série não for reconhecido pelo nome da turma, informe-o na coluna **Etapa**.
- Clique em **Ver sugestões e revisar** para analisar o plano proposto, por **turma, semana e aula**.
- Altere qualquer dropdown de habilidade, escolha **Não preencher** ou mantenha os registros já existentes. As mudanças na proposta são recalculadas sem perder a posição da tabela.
- Clique em **Aprovar e preencher** e confirme a operação **uma vez**. Só então a automação tenta salvar os planos.

**Não há aprovação separada por turma.** O usuário confere o conjunto inteiro antes de começar.

### Sugestões automáticas e simetria entre turmas (v3.1)

- **IDs numéricos** como `89423` são identificadores internos do SEGES, não nomes de habilidades. O histórico e a revisão mostram **códigos curriculares ou descrições**, quando disponibilizados pelo sistema.
- O planejador **já seleciona uma sugestão para cada aula com opções válidas no dropdown**. Você apenas confere e altera se necessário; a escolha manual só é inevitável quando não há nenhuma habilidade compatível disponível.
- Turmas da **mesma etapa/ano** usam preferencialmente a **mesma habilidade para a mesma disciplina, semana e posição da aula**. A comparação usa o código ou texto curricular, mesmo que os IDs sejam diferentes entre turmas.
- Quando históricos das turmas diferem, o programa usa a sugestão mais adiantada entre as equivalentes. **Turmas de séries distintas não são sincronizadas.**
- Quando você alterar uma habilidade na revisão, o programa replica a escolha para aulas equivalentes **ainda não preenchidas**, se elas oferecerem a mesma habilidade. Registros preexistentes são preservados por padrão.
- Se o SEGES não disponibilizar a habilidade equivalente em uma turma, o programa mantém uma sugestão própria e apresenta o aviso na revisão, em vez de forçar outro valor.

### Metodologias por aula (v3.2)

O preenchimento de **Ciências/Biologia** agora propõe **duas metodologias por aula**, nesta ordem:

1. **Aula expositiva dialogada** (incluindo variações como *Aula expositiva/dialogada*).
2. **Resolução de exercícios**.

A automação não escolhe mais a primeira metodologia do dropdown, o que anteriormente podia resultar em **Aprendizagem Baseada em Jogos**.

Na **tabela de revisão**, cada aula estruturada dispõe de **dois seletores de metodologia**. Você pode mudar qualquer um. Após uma alteração, o programa pergunta se deseja aplicar a mesma combinação às aulas equivalentes das **outras turmas do mesmo ano, na mesma semana, disciplina e posição da aula**. A aplicação só ocorre quando o SEGES disponibiliza essas opções na turma de destino; as aulas já preenchidas são preservadas por padrão.

Se o SEGES não oferecer as duas metodologias desejadas, o programa mostra o problema na revisão e **não permite autorizar aquela aula com menos de duas metodologias diferentes**. Você poderá escolher alternativas disponíveis ou marcar **Não preencher**. O script não cria metodologias artificiais nem as substitui automaticamente por jogos.

### Interface de janela única (v3.3.0)

**O painel pequeno não é mais escondido atrás de uma segunda janela.** Ao clicar em **Preencher planos** ou **Excluir planos**, o próprio painel muda para um espaço de trabalho que ocupa toda a janela do navegador, com o progresso e a tabela na mesma área visível. Ao fechar, volta ao formato de painel pequeno. Isso evita conflito de camadas escuras, diálogos do SEGES e janelas flutuantes ocultas.

A versão 3.3.0 substitui lançadores antigos do mesmo assistente encontrados na página e reinjeta seus estilos, mas ainda é importante manter apenas uma versão do userscript ativa no Violentmonkey. O conteúdo da prévia continua paginado em até 40 aulas e não salva registros antes da aprovação. Foram feitos testes simulados da abertura, substituição da tela, encerramento e sintaxe. **Não houve teste com a sessão autenticada do SEGES.**

### Visibilidade e desempenho da revisão (v3.2.9)

A janela principal de **Preencher planos → Ver sugestões e revisar** passou a ser exibida acima das camadas do SEGES, com estilos próprios e prioridade máxima. O painel pequeno de progresso é ocultado enquanto essa janela estiver aberta, e o **andamento da leitura aparece na própria janela principal**. Ao fechar ou cancelar, o painel pequeno reaparece.

A tabela de revisão agora apresenta **40 aulas por página** com botões **Anterior/Próxima**, sem perder a revisão ou consultar novamente o SEGES ao navegar. Isto evita renderizar milhares de opções de habilidades simultaneamente em lotes grandes. Se não houver aulas elegíveis, a tela mostra um aviso e desativa a aprovação. A operação continua **sem salvar planos até o usuário aprovar explicitamente**.

Foram realizados testes simulados de exibição da janela, ocultação/retorno do painel e paginação com 125 aulas e 160 opções de habilidade por aula. Não houve teste na sessão autenticada.

### Leitura eficiente da prévia (v3.2.7)

A preparação de **Preencher planos** lê somente as semanas selecionadas e os históricos necessários para sugerir habilidades. Quando várias semanas da mesma turma compartilham o mesmo histórico, esse grupo é processado uma única vez, e formulários já lidos são reutilizados **somente na memória da guia**. Semanas selecionadas sem aulas são ignoradas e não geram leitura de histórico. O log agora mostra uma linha de resumo por turma no lugar de repetidas mensagens `1/5...`, `2/5...`. Não houve mudanças no módulo **Excluir planos**. Testes simulados confirmaram agrupamento, ausência de consultas duplicadas, semanas vazias ignoradas e prévia preparada sem gravação. O preenchimento efetivo continua dependendo de teste autenticado no SEGES.

### Como o planejador escolhe habilidades

Para cada semana selecionada, o algoritmo consulta **somente até cinco semanas anteriores que realmente tenham conteúdo ou habilidades preenchidos**. Procura essas semanas de trás para frente, consultando **no máximo 12 candidatas anteriores** por semana; não percorre o ano inteiro. Se o histórico estiver incompleto, avisa na revisão.

A sequência funciona assim:

- A última habilidade usada aparece **1 ou 2 vezes** nas cinco semanas: sugerir a mesma habilidade.
- Aparece **3 ou mais vezes**: sugerir a próxima habilidade na ordem real do dropdown daquela aula.
- Chegou à **última opção**: continuar nela, **sem voltar ao começo**.
- A habilidade anterior não existe na lista atual: **não reiniciar a sequência automaticamente**; exigir escolha manual.
- Sem histórico ou com etapa desconhecida: mostrar alternativas; se a etapa for reconhecida, pode sugerir a primeira opção compatível, sempre sujeita à aprovação.

O filtro curricular usa os códigos EF/EM das habilidades quando estão disponíveis. Se a etapa não puder ser determinada, a seleção é manual. O script não insere opções inventadas para forçar o formulário.

### Semanas sem aulas

**Correção v3.2.6 — prévia de planejamentos:** o erro `Cannot read properties of null (reading 'filter')` foi rastreado especificamente até a função `lerAulas`. A leitura das opções de metodologias consultava um único elemento (ou `null`) e chamava `.filter()`. A função agora busca sempre uma lista, incluindo a lista vazia quando o SEGES não disponibiliza metodologias para determinada aula. Foram simulados: aula sem opções, aula com duas metodologias, semana sem aulas e formulário inválido; os quatro testes passaram. **Essa falha ocorria na leitura para planejamento, não durante a exclusão.** O módulo de exclusão não foi alterado nesta correção.

Feriados, conselhos de classe, encerramentos de período e outras semanas em que não há aulas são **ignorados automaticamente**, sem preenchimento nem salvamento. O painel registra a semana ignorada e a revisão mostra um aviso, mas o programa segue com as demais semanas selecionadas.

**Proteção:** se o SEGES retornar uma página de login, erro ou um formulário não reconhecido, não será tratado como uma semana vazia: a execução interrompe para evitar preenchimento na página errada.

### Sem progresso persistente

**O programa não salva progresso, escolha de semanas, histórico de execução, preferências ou posição do painel** em localStorage, sessionStorage ou no servidor. Tudo o que o programa está fazendo fica apenas na memória da guia aberta. **Fechar a guia encerra a automação.**

O preenchimento usa um formulário interno à própria guia e envia cada semana **no máximo uma vez**, verificando o registro que o SEGES devolve. Em caso de erro, timeout ou resultado não confirmado, o script interrompe e não repete a submissão automaticamente.

O botão **Parar** cancela as operações pendentes. Depois de uma interrupção manual, **recarregue a guia** para iniciar de novo, evitando que ações antigas se misturem com uma nova execução.

**Importante:** registros que o SEGES já recebeu podem permanecer salvos mesmo após fechar a guia ou interromper uma operação. Confira-os diretamente no SEGES antes de executar novamente.

### Excluir planos de várias turmas

**Diagnóstico v3.2.5:** o erro JavaScript `Cannot read properties of null (reading 'filter')` ainda não teve origem reproduzida na rotina de exclusão da versão publicada. O programa agora mostra claramente a versão no painel e inclui a **localização técnica (stack trace)** na opção **Copiar diagnóstico**, tanto em erros de carregamento quanto em falhas durante a exclusão. Parâmetros das URLs são ocultados nesse diagnóstico. A correção do comando Rails da versão 3.2.4 permanece. Confira se a versão indicada no topo do painel é realmente **3.2.5** e mantenha apenas uma versão do userscript ativa. Não repita exclusões cujo resultado não foi verificado no SEGES.

**Correção v3.2.4 (HTTP 404 na exclusão):** a aplicação de alguns comandos com `data-method="delete"` estava enviando um `DELETE` HTTP direto. Em Rails UJS, esse link é acionado como formulário `POST` com `_method=delete`. O assistente agora respeita essa distinção, mantém comandos `data-turbo-method="delete"` com `DELETE`, e não força o cabeçalho de XMLHttpRequest em formulários HTML. O diagnóstico também registra o método usado, sem divulgar tokens. **Não há tentativa automática com métodos alternativos** após um erro. A alteração passou em testes simulados, mas ainda precisa de validação na sessão autenticada do SEGES. Teste primeiro apenas um plano.

**Diagnóstico de exclusão — v3.2.3:** antes de excluir o primeiro plano do lote, o programa verifica se consegue localizar os comandos oficiais de exclusão de **todos** os registros selecionados. Se algum não tiver comando reconhecido, interrompe o lote **sem executar nenhuma exclusão**. Se uma requisição falhar ou a confirmação não funcionar, a mensagem mostrará a etapa, turma, semana, motivo e a quantidade de exclusões verificadas. O botão **Copiar diagnóstico** permite compartilhar o problema. Não repita uma operação que tenha enviado exclusões sem antes conferir no SEGES quais registros continuam presentes.



**Correção v3.2.2:** a seleção de planos para exclusão agora reconhece corretamente todas as caixas marcadas, atualiza o contador e habilita **Excluir planos marcados**. Foi testada com marcação de célula individual, coluna, turma e comandos selecionar tudo/desmarcar tudo em simulação. A exclusão efetiva ainda depende de teste autenticado no SEGES.

A tabela de exclusão permite **seleção individual e em lote**:

- Clique na **caixa do cabeçalho de uma coluna** para marcar todos os planos daquela semana, em todas as turmas disponíveis.
- Clique na **caixa ao lado do nome de uma turma** para marcar todos os planos dessa turma.
- Use **Selecionar tudo** ou **Desmarcar tudo** para todas as células disponíveis.
- A seleção exibe um **contador** de planos marcados antes de confirmar a operação.


Clique em **Excluir planos**. A tabela de turmas por semana mostra somente registros existentes. Marque os planos que deseja excluir, clique em **Excluir planos marcados** e digite a expressão exata exigida na confirmação.

O programa procura um controle oficial de exclusão no HTML do SEGES, verifica a identidade do registro e tenta confirmar cada exclusão na listagem. Se não encontrar comando compatível ou não conseguir verificar o resultado, interrompe sem adivinhar URLs de exclusão.

**Exclusões podem ser irreversíveis.**

## Outros módulos

### Faltas e validação

Na página `/absences`, o módulo de validação permanece disponível com seleção de turmas/meses, barra de progresso, log TXT e identificação de dias que o SEGES explicitamente informa como sem plano semanal. A detecção não equivale a uma auditoria completa de todos os dias letivos.

### Notas

O script reserva o módulo de lançamento de notas para implementação futura. **Ainda não lança notas.**

## Histórico

As versões independentes e anteriores estão guardadas em [SEGES/arquivo](SEGES/arquivo), incluindo:
- [Assistente unificado v2.2.0 antes da nova interface](SEGES/arquivo/assistente-seges-v2.2.0-original.user.js)
- [Assistente v2.1.0](SEGES/arquivo/assistente-seges-v2.1.0-antes-correcao.user.js)
- [Plano Semanal v1.6.0](SEGES/arquivo/plano-semanal-v1.6.0-original.user.js)
- [Validação v6.2 independente](SEGES/arquivo/validacao-automatica-v6.2-standalone.user.js)

**Instale somente o arquivo principal, nunca os históricos simultaneamente.**

## Testes e limitações

- A **sintaxe JavaScript** foi verificada.
- A escolha das duas metodologias, as variações de nomes, o impedimento de substituição por jogos e a correspondência entre turmas foram conferidas com dados simulados.
- Foram testados cenários simulados de semana sem aulas, aviso explícito de ausência de aulas e páginas inválidas; os dois primeiros são ignorados e as páginas inválidas provocam erro seguro.
- Foram corrigidas as consultas de múltiplas aulas e campos do formulário, para evitar que o script interpretasse uma aula isolada como a lista inteira.
- A seleção automática de **2 ou 4 semanas após a última planejada**, a filtragem de habilidades por ano escolar, a progressão curricular e a simetria entre turmas com IDs internos diferentes foram testadas com **dados simulados**.
- **Não foi possível testar o carregamento e o salvamento reais com a sessão autenticada do SEGES**. Em especial, o formulário interno depende de o site permitir a abertura de páginas dentro da mesma guia. Se isso for bloqueado, o programa deverá parar em vez de contornar essa restrição.
- Comece testando **uma turma e uma semana**, confira as sugestões e o registro salvo no SEGES antes de executar lotes maiores.

A responsabilidade pela escolha pedagógica e pela conferência final dos registros permanece com o usuário.
