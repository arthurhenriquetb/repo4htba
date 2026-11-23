# SEGES • Assistente

**Um único script para o Violentmonkey** com módulos que identificam a tela aberta no [SEGES / SEDU-ES](https://seges.sedu.es.gov.br/).

## Instalação

**Script principal:** [SEGES/assistente-seges.user.js](SEGES/assistente-seges.user.js) · Versão **2.2.0**

1. Abra o arquivo acima no GitHub.
2. Clique em **Raw** (ou **Código bruto**) para exibir o código puro.
3. No **Violentmonkey**, clique no ícone da extensão e em **Criar novo script**.
4. Apague todo o texto de exemplo e cole o código completo.
5. Salve com **Ctrl + S**.
6. **Desative ou exclua os dois scripts anteriores do SEGES** no Violentmonkey ou Tampermonkey. **Não deixe cópias em execução ao mesmo tempo.**
7. Recarregue a página do SEGES.

Se o painel antigo continuar aparecendo, confirme que nenhuma outra versão do script permanece habilitada na extensão.

O script detecta automaticamente a página aberta e executa somente o módulo correspondente. Não precisa instalar componentes separados.

## Módulos

### 1. Faltas e validação de conteúdos

Na página de faltas (`/absences`), o painel permite:
- Escolher as turmas e meses.
- Validar conteúdos ministrados nas datas pendentes e disciplinas disponíveis.
- Acompanhar a turma, a barra de progresso e o histórico em TXT.
- Consultar dias em que **o texto apresentado pelo SEGES indica explicitamente** falta de plano semanal, além de casos para revisão manual.
- Arrastar o painel pela tela.

**Atenção:** a verificação de falta de planejamento não é auditoria integral de todas as aulas. O script examina as datas pendentes reconhecidas na interface.

### 2. Planos semanais

Na página de planos semanais (`/weekly_plans`), o painel exibe **Preencher planos** mesmo após uma execução concluída.

Para selecionar várias turmas:
1. Abra a lista de **Planos Semanais** no SEGES.
2. Clique em **Preencher planos**.
3. Marque **uma ou mais turmas**.
4. Clique em **Mostrar semanas**.
5. Para cada turma, marque as semanas desejadas. Use **Todas**, **Sem plano** ou **Nenhuma** para agilizar.
6. Se o nome da turma não identificar claramente a etapa, escolha explicitamente **ano/série** no campo da turma.
7. Clique em **Iniciar preenchimento selecionado** para **mapear** as semanas (isso ainda não salva nada).
8. Terminada a leitura da primeira turma, aparece a janela **Conferir habilidades antes do preenchimento**, organizada por **semana e aula**. Veja a habilidade sugerida e as habilidades dos cinco planos anteriores. Pode escolher outra habilidade disponível naquela aula, deixar a aula sem preencher ou preservar uma aula existente.
9. Clique em **Aprovar e preencher**. Quando pedir alteração de habilidade já registrada, haverá uma segunda confirmação explícita.
10. A próxima turma será mapeada e passará por sua própria conferência antes do preenchimento. No final, o relatório reúne as turmas.

### Seleção pedagógica de habilidades (v2.2)

- O programa considera as habilidades registradas nos **cinco planos anteriores** da turma, na ordem das semanas.
- Se a última habilidade utilizada aparecer **uma ou duas vezes** nesse histórico, sugere repeti-la.
- Se ela aparecer **três ou mais vezes**, sugere a **próxima** habilidade disponível na lista da aula.
- Se chegar à última habilidade da lista, **permanece nela**. **Não retorna ao início.**
- O programa filtra opções por **etapa/ano**, usando a série escolhida ou o código curricular da lista quando for inequívoco. Se não identificar a etapa com segurança, **não faz sugestão automática**: a escolha fica com o usuário.
- Cada sugestão deve ser **aprovada individualmente por aula** antes de qualquer preenchimento.
- As opções escolhidas precisam existir na lista real do SEGES para aquela aula. O programa não insere habilidades fictícias nem força valores não disponibilizados pelo formulário.

### Proteção contra execução interminável e erros

Depois de clicar em **Salvar**, o script registra que o envio foi realizado e **não volta a clicar em Salvar na mesma semana**. Se o SEGES permanecer no formulário, apresentar um erro, redirecionar de maneira inesperada ou não confirmar o retorno, a automação fica **interrompida**, com a mensagem do erro no painel e no log. Também existe um limite de espera para impedir insistência sem fim.

O botão **Parar e limpar** agora registra um pedido de cancelamento que é verificado durante a execução, inclusive entre aulas e **antes de enviar o formulário**. Dessa forma, um processamento anterior não deverá continuar gravando depois de você interrompê-lo. O pedido também é isolado por identificação de execução para impedir que uma rotina antiga se misture a uma nova.

**Importante:** uma interrupção não significa que o registro não tenha sido salvo. Confira o SEGES antes de repetir a operação. Para iniciar uma execução nova após um erro, volte à lista de Planos Semanais e use **Preencher planos** (ou **Parar e limpar** para remover a execução antiga). A versão 2.2 não retoma estados de execução das versões anteriores.

O programa tenta preservar conteúdos e habilidades preexistentes; substituições exigem confirmação. O preenchimento percorre as turmas em sequência, com barra de progresso e relatório por turma.

#### Exclusão de planos

Na página de turmas ou semanas, clique em **Gerenciar exclusões**. Marque turmas, consulte os planos existentes e escolha as semanas exatas. A exclusão exige digitar a frase de confirmação com a quantidade selecionada.

O script só tenta excluir quando consegue localizar **um comando real de exclusão do próprio SEGES**. Se o comando não estiver disponível, não cria uma URL de exclusão por suposição e registra a falha. Reconsulta a listagem após as tentativas e separa exclusões verificadas de casos não confirmados. A operação é irreversível e deve ser usada com cuidado.

### 3. Notas — futuro

Existe um espaço reservado para o módulo de lançamento automático de notas. **Ainda não há preenchimento de notas.** Quando o formato real dessa tela for analisado, a funcionalidade será incorporada ao **mesmo arquivo**.

## Histórico e arquivos

O único script principal fica em **SEGES/assistente-seges.user.js**.

As cópias independentes foram arquivadas em:
- [Validação v6.2](SEGES/arquivo/validacao-automatica-v6.2-standalone.user.js)
- [Validação v6.1 original](SEGES/arquivo/validacao-automatica-v6.1-original.js)
- [Plano Semanal v1.6.0](SEGES/arquivo/plano-semanal-v1.6.0-original.user.js)
- [Plano Semanal v1.3.2 original](SEGES/arquivo/plano-semanal-v1.3.2-original.user.js)
- [Assistente unificado v2.1.0 (arquivo histórico)](SEGES/arquivo/assistente-seges-v2.1.0-antes-correcao.user.js)

Não instale os arquivos históricos junto com o script principal.

## Limites e verificações

- A sintaxe JavaScript da versão 2.2 foi conferida.
- A passagem entre turmas, a chegada à tela de revisão, o algoritmo baseado nos cinco planos anteriores, a filtragem por ano/série e as proteções de preenchimento foram testados em **cenários simulados**.
- **Não foi possível realizar teste na sessão autenticada do SEGES**. O funcionamento depende da estrutura e das permissões reais disponíveis na interface.
- O indicador de progresso mede etapas processadas, não confirma por si só o salvamento no servidor. Confira os planos e o log ao finalizar.
- Como o script interage com registros escolares oficiais, teste inicialmente em poucas semanas. Verifique cada exclusão diretamente no SEGES.

**Desenvolvido para uso com o SEGES da SEDU-ES.**
