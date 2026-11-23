# SEGES • Assistente

**Um único script para o Violentmonkey** com módulos que identificam a tela aberta no [SEGES / SEDU-ES](https://seges.sedu.es.gov.br/).

## Instalação

**Script principal:** [SEGES/assistente-seges.user.js](SEGES/assistente-seges.user.js) · Versão **2.1.0**

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
6. Clique em **Iniciar preenchimento selecionado**.

O programa lê todas as semanas de cada turma para identificar habilidades já utilizadas e considera as semanas selecionadas ao completar campos. Ele tenta **preservar conteúdos e habilidades preexistentes** e dar preferência às habilidades menos usadas para reduzir repetições. Processa as turmas em sequência, com barra de progresso e relatório conjunto por turma.

A execução continua em navegações do SEGES. Se houver uma execução antiga incompatível em andamento, use **Parar e limpar** no painel para iniciar uma nova seleção.

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

Não instale os arquivos históricos junto com o script principal.

## Limites e verificações

- A sintaxe JavaScript da versão unificada foi conferida.
- A troca entre turmas, a consolidação do relatório e algumas regras de preenchimento foram testadas com **dados simulados**.
- **Não foi possível realizar teste na sessão autenticada do SEGES**. O funcionamento depende da estrutura e das permissões reais disponíveis na interface.
- O indicador de progresso mede etapas processadas, não confirma por si só o salvamento no servidor. Confira os planos e o log ao finalizar.
- Como o script interage com registros escolares oficiais, teste inicialmente em poucas semanas. Verifique cada exclusão diretamente no SEGES.

**Desenvolvido para uso com o SEGES da SEDU-ES.**
