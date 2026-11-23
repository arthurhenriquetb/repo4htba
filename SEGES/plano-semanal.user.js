// ==UserScript==
// @name         SEGES - Plano Semanal - Automação de preenchimento
// @namespace    https://openai.local/
// @version      1.6.0
// @description  Semanas selecionáveis, preenchimento incremental e exclusão em lote confirmada.
// @match        https://seges.sedu.es.gov.br/*weekly_plans*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

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
    return week ? Number(week) : null;
  }

  function getCurrentClassroomId() {
    const hidden = qs('#classroom_id');
    if (hidden && hidden.value) return String(hidden.value);
    const url = getUrl(location.href);
    return url?.searchParams.get('classroom_id') || null;
  }

  function isClassroomsPage() {
    return !!qsa('a.btn.btn-sm.btn-primary').find((a) => {
      const href = a.getAttribute('href') || '';
      return href.includes('/weekly_plans?classroom_id=');
    });
  }

  function isWeeksPage() {
    return !!qsa('a.btn.btn-sm.btn-primary').find((a) => {
      const href = a.getAttribute('href') || '';
      return href.includes('/weekly_plans/new?classroom_id=') || href.includes('/weekly_plans/') && href.includes('/edit');
    }) && !qs('#weekly_plan');
  }

  function isWeekFormPage() {
    return !!qs('#weekly_plan') && !!qs('input[type="submit"][value="Salvar"], input[name="commit"][value="Salvar"]');
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

  function parseWeeksTable() {
    const rows = qsa('table.table.table-striped tbody tr.middle');
    return rows
      .map((tr) => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 4) return null;
        const link = qs('a.btn.btn-sm.btn-primary', tr);
        if (!link) return null;
        const href = link.getAttribute('href') || '';
        const url = getUrl(href);
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

  function buildExecutionPlan(state) {
    const allSummaries=state.weeks.map((item)=>state.summaries[String(item.week)]).filter(Boolean);
    const selected=new Set((state.selectedWeeks||state.weeks.map((item)=>item.week)).map(Number));
    const abilities=uniqueBy(state.abilities||[],(ability)=>String(ability.value));
    const used=new Map(abilities.map((ability)=>[String(ability.value),0]));
    const plans={};
    const reports=[];
    const preserved={manual:0,structured:0};
    let lastAbility='';
    let lastIndex=-1;
    for(const summary of allSummaries){
      const usedInWeek=new Set(summary.rows
        .filter((row)=>row.kind==='science'&&row.existingAbilityValue)
        .map((row)=>String(row.existingAbilityValue)));
      for(const value of usedInWeek)used.set(value,(used.get(value)||0)+1);
    }
    const getAbility=(value)=>abilities.find((a)=>String(a.value)===String(value))||null;
    function pickAbility(){
      if(!abilities.length)return null;
      const minimum=Math.min(...abilities.map((ability)=>used.get(String(ability.value))||0));
      for(let offset=1;offset<=abilities.length;offset++){
        const index=(lastIndex+offset)%abilities.length;
        const ability=abilities[index];
        if((used.get(String(ability.value))||0)===minimum && (abilities.length===1 || String(ability.value)!==lastAbility)){
          lastIndex=index;
          lastAbility=String(ability.value);
          return ability;
        }
      }
      for(let offset=1;offset<=abilities.length;offset++){
        const index=(lastIndex+offset)%abilities.length;
        const ability=abilities[index];
        if((used.get(String(ability.value))||0)===minimum){
          lastIndex=index;
          lastAbility=String(ability.value);
          return ability;
        }
      }
      return null;
    }
    for(const summary of allSummaries){
      if(!selected.has(Number(summary.week)))continue;
      const instructions=[];
      plans[String(summary.week)]={week:summary.week,instructions};
      const existingWeekSkill=summary.rows
        .filter((row)=>row.kind==='science'&&row.existingAbilityValue)
        .map((row)=>getAbility(row.existingAbilityValue)).find(Boolean)||null;
      const hasBlankScience=summary.rows.some((row)=>row.kind==='science'&&!row.existingAbilityValue&&!row.existingManualText);
      const chosen=existingWeekSkill||(hasBlankScience?pickAbility():null);
      if(!existingWeekSkill&&chosen){
        const key=String(chosen.value);
        used.set(key,(used.get(key)||0)+1);
      }
      if(existingWeekSkill)lastAbility=String(existingWeekSkill.value);
  
      for(const row of summary.rows){
        if(row.kind==='practice'||row.manualProfile){
          if(row.existingManualText){preserved.manual+=1;continue;}
          const profile=row.manualProfile||getManualDisciplineProfile(row.discipline);
          const manualText=row.kind==='practice'?CONFIG.practiceText:(profile?.manualText||'');
          if(!manualText)continue;
          instructions.push({rowIndex:row.rowIndex,kind:row.kind,date:row.date,discipline:row.discipline,manualText});
          reports.push({week:summary.week,date:row.date,discipline:row.discipline,
            kind:row.kind==='practice'?'Prática Experimental':(profile?.reportKind||row.discipline),
            ability:'',knowledge:'',methodologies:'',evaluation:'Não',manualText});
          continue;
        }
        if(row.kind!=='science')continue;
        // Preservar registros textuais de Ciências já preenchidos.
        if(row.existingManualText){preserved.manual+=1;continue;}
        const prev=!!row.existingAbilityValue;
        const ability=prev?getAbility(row.existingAbilityValue):chosen;
        if(!ability){
          appendLog(state,'Habilidade indisponível para completar uma aula; registro preservado.',{
            week:summary.week,row:row.rowIndex+1,previous:row.existingAbilityValue||''
          });
          continue;
        }
        const knowledgeFilled=!!row.existingKnowledgeCount;
        const methodFilled=!!row.existingMethodologyCount;
        const isEvaluation=row.existingEvaluation==='true';
        if(prev && knowledgeFilled && (methodFilled||isEvaluation)){
          preserved.structured+=1;
          continue;
        }
        const position=instructions.filter((item)=>item.kind==='science'&&item.abilityValue===String(ability.value)).length;
        const knowledges=ability.knowledges||[];
        const methods=ability.methodologies||[];
        const preferences=position===0
          ?['Aula expositiva/dialogada','Aula dialogada','Aula expositiva']
          :position===1
            ?['Resolução de exercícios','Resolução de problemas']
            :position%3===2
              ?['Mapa Mental']
              :['Aula expositiva/dialogada','Resolução de exercícios','Mapa Mental'];
        const method=findPreferredMethod(methods,preferences)||methods[0]||null;
        const instruction={
          rowIndex:row.rowIndex,kind:'science',discipline:row.discipline,date:row.date,
          abilityValue:String(ability.value),abilityLabel:ability.label,
          knowledge:knowledges.length?knowledges[position%knowledges.length]:'',
          methodologies:method?[method]:[],evaluation:false,previouslySelected:prev,
          weekForReport:summary.week
        };
        instructions.push(instruction);
        reports.push({week:summary.week,date:row.date,discipline:row.discipline,
          kind:prev?'Ciências/Biologia (completar)':'Ciências/Biologia',
          ability:ability.label,knowledge:instruction.knowledge,
          methodologies:instruction.methodologies.join(' | '),evaluation:'Não',manualText:''});
      }
    }
    // A avaliação sugerida recai sobre a última aula nova de cada bloco
    // consecutivo de habilidades, sem alterar indicadores preexistentes.
    let pending=[];
    let previousValue='';
    function finishBlock(){
      const last=[...pending].reverse().find((item)=>!item.previouslySelected);
      if(last){
        last.evaluation=true;
        last.methodologies=[];
        const report=reports.find((row)=>row.week===last.weekForReport &&
          row.date===last.date&&row.discipline===last.discipline&&row.ability===last.abilityLabel);
        if(report){report.evaluation='Sim';report.methodologies='';}
      }
      pending=[];
    }
    for(const week of state.weeks){
      const plan=plans[String(week.week)];
      if(!plan){finishBlock();previousValue='';continue;}
      for(const instr of plan.instructions.filter((item)=>item.kind==='science')){
        if(previousValue&&previousValue!==instr.abilityValue)finishBlock();
        pending.push(instr);
        previousValue=instr.abilityValue;
      }
    }
    finishBlock();
  
    state.executionPlan=plans;
    state.reportRows=reports;
    state.applyWeeks=state.weeks.filter((week)=>(plans[String(week.week)]?.instructions.length||0)>0);
    state.computed={
      abilityCount:abilities.length,totalWeeks:state.weeks.length,
      selectedWeeks:selected.size,weeksToFill:state.applyWeeks.length,
      preserved,skillUsage:Array.from(used.entries()).map(([value,weeks])=>({ability:getAbility(value)?.label||value,weeks}))
    };
    appendLog(state,'Leitura concluída: serão preenchidas apenas as lacunas encontradas.',state.computed);
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

  async function applyInstructionToRow(state, rowElement, instruction) {
    if (instruction.kind !== 'science') {
      const textarea = qs('textarea', rowElement);
      if (textarea && instruction.manualText && !String(textarea.value || '').trim()) {
        setTextareaValue(textarea, instruction.manualText);
      }
      return;
    }

    // Completar o bloco já utilizado, se houver várias habilidades na aula.
    const existingBlocks = getVisibleStructuredBlocks(rowElement);
    const matchingBlock = existingBlocks.find((part) =>
      String(qs('.structured-weekly-plan-id-select', part)?.value || '').trim() === String(instruction.abilityValue)
    );
    const block = matchingBlock || await ensureStructuredBlock(rowElement);
    initializeSelectsInRoot(block);
    const selectedBefore = String(qs('.structured-weekly-plan-id-select', block)?.value || '').trim();
    if (selectedBefore && selectedBefore !== String(instruction.abilityValue)) {
      appendLog(state, 'Habilidade já registrada diverge do plano calculado; não sobrescrever.', {
        week: getCurrentWeekFromForm(), row: instruction.rowIndex+1, selectedBefore
      });
      return;
    }
    const ability = getAbilityFromState(state, instruction.abilityValue);

    const evaluationSelect = qs('.structured-weekly-plan-evaluation-select', block);
    const abilitySelect = qs('.structured-weekly-plan-id-select', block);
    let knowledgeSelect = qs('.structured-weekly-plan-knowledges-select', block);
    let methodologySelect = qs('.structured-weekly-plan-methodologies-select', block);

    if (!abilitySelect) {
      throw new Error('Select de habilidade não encontrado.');
    }

    let targetAbilityOption = Array.from(abilitySelect.options).find((option) => String(option.value) === String(instruction.abilityValue));
    if (!targetAbilityOption) {
      targetAbilityOption = new Option(instruction.abilityLabel, instruction.abilityValue, false, false);
      setStructuredAbilityOptionData(targetAbilityOption, ability);
      abilitySelect.add(targetAbilityOption);
    } else {
      setStructuredAbilityOptionData(targetAbilityOption, ability);
    }

    const abilitySelected = selectedBefore
      ? true
      : await populateSelectRobust(abilitySelect, [String(instruction.abilityValue)], false);
    if (!abilitySelected) {
      throw new Error(`Não foi possível selecionar a habilidade ${instruction.abilityLabel}.`);
    }

    await sleep(CONFIG.afterAbilityDelayMs);

    knowledgeSelect = await waitFor(() => qs('.structured-weekly-plan-knowledges-select', block), 2500, 100) || knowledgeSelect;
    methodologySelect = await waitFor(() => qs('.structured-weekly-plan-methodologies-select', block), 2500, 100) || methodologySelect;

    if (knowledgeSelect && !hasAnyConcreteOption(knowledgeSelect) && (ability?.knowledges || []).length) {
      forcePopulateDependentSelects(block, ability);
      knowledgeSelect = qs('.structured-weekly-plan-knowledges-select', block) || knowledgeSelect;
    }
    if (!instruction.evaluation && methodologySelect && !hasAnyConcreteOption(methodologySelect) && (ability?.methodologies || []).length) {
      forcePopulateDependentSelects(block, ability);
      methodologySelect = qs('.structured-weekly-plan-methodologies-select', block) || methodologySelect;
    }

    const hasKnowledge = !!getSelectedValues(knowledgeSelect).length;
    const hasMethodology = !!getSelectedValues(methodologySelect).length;
    const selectedKnowledges = hasKnowledge ? [] : getFallbackDesiredValues(knowledgeSelect, instruction.knowledge ? [instruction.knowledge] : []);
    const selectedMethodologies = hasMethodology ? [] : getFallbackDesiredValues(methodologySelect, instruction.methodologies || []);
    const fallbackKnowledges = ability?.knowledges || selectedKnowledges;
    const fallbackMethodologies = ability?.methodologies || selectedMethodologies;

    if (selectedKnowledges.length && knowledgeSelect) {
      let loadedKnowledgeSelect = await ensureSelectHasExpectedOptions(
        state,
        knowledgeSelect,
        selectedKnowledges,
        fallbackKnowledges,
        'Objeto de conhecimento',
        {
          week: getCurrentWeekFromForm(),
          rowIndex: instruction.rowIndex,
          ability: instruction.abilityLabel
        }
      );

      await sleep(CONFIG.afterKnowledgeDelayMs);
      const desiredKnowledgeValues = getFallbackDesiredValues(loadedKnowledgeSelect, selectedKnowledges);
      await waitForStableConcreteOptions(loadedKnowledgeSelect, desiredKnowledgeValues, 5000, 1000);
      logSelectSnapshot(state, 'Objeto de conhecimento - opções estabilizadas', loadedKnowledgeSelect, desiredKnowledgeValues, {
        week: getCurrentWeekFromForm(),
        rowIndex: instruction.rowIndex,
        ability: instruction.abilityLabel
      });

      let knowledgeSelected = await directSelectAndVerify(
        state,
        'Objeto de conhecimento',
        loadedKnowledgeSelect,
        desiredKnowledgeValues,
        true,
        { week: getCurrentWeekFromForm(), rowIndex: instruction.rowIndex, ability: instruction.abilityLabel }
      );

      if (!knowledgeSelected) {
        appendLog(state, 'Objeto de conhecimento - fallback: reconstruindo opções do campo.', {
          week: getCurrentWeekFromForm(),
          rowIndex: instruction.rowIndex,
          fallbackKnowledges
        });
        rebuildSelectOptions(loadedKnowledgeSelect, fallbackKnowledges);
        await sleep(500);
        await waitForStableConcreteOptions(loadedKnowledgeSelect, desiredKnowledgeValues, 2500, 500);
        knowledgeSelected = await directSelectAndVerify(
          state,
          'Objeto de conhecimento (após rebuild)',
          loadedKnowledgeSelect,
          desiredKnowledgeValues,
          true,
          { week: getCurrentWeekFromForm(), rowIndex: instruction.rowIndex, ability: instruction.abilityLabel }
        );
      }

      if (!knowledgeSelected) {
        appendLog(state, 'Falha ao selecionar objeto de conhecimento.', {
          week: getCurrentWeekFromForm(),
          rowIndex: instruction.rowIndex,
          selectedKnowledges,
          availableOptions: Array.from((loadedKnowledgeSelect?.options || [])).map((option) => option.textContent || option.value)
        });
        throw new Error(`Objeto de conhecimento não selecionado na semana ${getCurrentWeekFromForm()} linha ${instruction.rowIndex + 1}.`);
      }
    }

    if (!instruction.evaluation && selectedMethodologies.length && methodologySelect) {
      let loadedMethodologySelect = await ensureSelectHasExpectedOptions(
        state,
        methodologySelect,
        selectedMethodologies,
        fallbackMethodologies,
        'Metodologias',
        {
          week: getCurrentWeekFromForm(),
          rowIndex: instruction.rowIndex,
          ability: instruction.abilityLabel
        }
      );

      await sleep(CONFIG.afterMethodologyDelayMs);
      const desiredMethodologyValues = getFallbackDesiredValues(loadedMethodologySelect, selectedMethodologies);
      await waitForStableConcreteOptions(loadedMethodologySelect, desiredMethodologyValues, 5000, 1000);
      logSelectSnapshot(state, 'Metodologias - opções estabilizadas', loadedMethodologySelect, desiredMethodologyValues, {
        week: getCurrentWeekFromForm(),
        rowIndex: instruction.rowIndex,
        ability: instruction.abilityLabel
      });

      let methodologySelected = await directSelectAndVerify(
        state,
        'Metodologias',
        loadedMethodologySelect,
        desiredMethodologyValues,
        true,
        { week: getCurrentWeekFromForm(), rowIndex: instruction.rowIndex, ability: instruction.abilityLabel }
      );

      if (!methodologySelected) {
        appendLog(state, 'Metodologias - fallback: reconstruindo opções do campo.', {
          week: getCurrentWeekFromForm(),
          rowIndex: instruction.rowIndex,
          fallbackMethodologies
        });
        rebuildSelectOptions(loadedMethodologySelect, fallbackMethodologies);
        loadedMethodologySelect.disabled = false;
        await sleep(500);
        await waitForStableConcreteOptions(loadedMethodologySelect, desiredMethodologyValues, 2500, 500);
        methodologySelected = await directSelectAndVerify(
          state,
          'Metodologias (após rebuild)',
          loadedMethodologySelect,
          desiredMethodologyValues,
          true,
          { week: getCurrentWeekFromForm(), rowIndex: instruction.rowIndex, ability: instruction.abilityLabel }
        );
      }

      if (!methodologySelected) {
        appendLog(state, 'Falha ao selecionar metodologias.', {
          week: getCurrentWeekFromForm(),
          rowIndex: instruction.rowIndex,
          selectedMethodologies,
          availableOptions: Array.from((loadedMethodologySelect?.options || [])).map((option) => option.textContent || option.value)
        });
        throw new Error(`Metodologias não selecionadas na semana ${getCurrentWeekFromForm()} linha ${instruction.rowIndex + 1}.`);
      }
    }

    if (evaluationSelect && (!selectedBefore || !String(evaluationSelect.value || '').trim())) {
      evaluationSelect.value = instruction.evaluation ? 'true' : 'false';
      evaluationSelect.dispatchEvent(new Event('input', { bubbles: true }));
      evaluationSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function getWeekPlanForCurrentPage(state) {
    const currentWeek = getCurrentWeekFromForm();
    if (currentWeek == null) return null;
    return state.executionPlan?.[String(currentWeek)] || null;
  }

  async function handleScanPage(state) {
    const currentWeek = getCurrentWeekFromForm();
    const expectedWeek = state.weeks[state.scanIndex]?.week;
    if (currentWeek !== expectedWeek) {
      appendLog(state, 'Semana aberta não corresponde à esperada no escaneamento.', { currentWeek, expectedWeek });
      saveState(state);
      return;
    }

    const summary = parseCurrentWeekSummary();
    state.summaries[String(summary.week)] = summary;
    if ((!state.abilities || !state.abilities.length)) {
      const abilities = await extractAbilitiesFromPage(state);
      if (abilities.length) {
        state.abilities = abilities;
        appendLog(state, 'Habilidades capturadas na primeira semana com Ciências/Biologia.', {
          count: state.abilities.length
        });
      } else if (summary.abilities?.length) {
        // fallback antigo (template) - pode vir sem knowledges/methodologies dependendo do encoding
        state.abilities = summary.abilities;
        appendLog(state, 'Habilidades capturadas via template (fallback).', {
          count: state.abilities.length
        });
      }
    }

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

    state.status = 'applying';
    state.applyIndex = 0;
    state.waitingReturn = false;
    buildExecutionPlan(state);
    if (!state.applyWeeks.length) {
      state.status = 'done';
      appendLog(state, 'Nenhuma lacuna foi encontrada nas semanas escolhidas.');
      saveState(state);
      renderPanel();
      alert('Leitura concluída: não há lacunas detectadas nas semanas escolhidas.');
      return;
    }
    saveState(state);
    await sleep(CONFIG.navigationDelayMs);
    location.href = state.applyWeeks[0].url;
  }

  async function handleApplyPage(state) {
    const currentWeek = getCurrentWeekFromForm();
    const expectedWeek = (state.applyWeeks || state.weeks)[state.applyIndex]?.week;
    if (currentWeek !== expectedWeek) {
      appendLog(state, 'Semana aberta não corresponde à esperada na aplicação.', { currentWeek, expectedWeek });
      saveState(state);
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

    const rows = qsa('#weekly_plan tr.by-curriculum-discipline');
    appendLog(state, 'Aplicando semana.', { week: currentWeek, instructions: plan.instructions.length });
    saveState(state);

    for (const instruction of plan.instructions) {
      const rowElement = rows[instruction.rowIndex];
      if (!rowElement) {
        appendLog(state, 'Linha não encontrada para instrução.', instruction);
        continue;
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
    appendLog(state, 'Semana preenchida. Enviando formulário.', { week: currentWeek });
    saveState(state);

    await sleep(CONFIG.saveDelayMs);

    const saveButton = qs('input[type="submit"][value="Salvar"], input[name="commit"][value="Salvar"]');
    if (!saveButton) {
      throw new Error('Botão Salvar não encontrado.');
    }
    saveButton.click();
  }

  function continueFromWeeksPage(state) {
    if (state.status === 'done') return;
    if (!state.waitingReturn) return;

    const lastWeek = Number(state.lastAppliedWeek);
    const applying=state.applyWeeks||state.weeks;
    const currentIndex = applying.findIndex((item) => item.week === lastWeek);
    const nextIndex = currentIndex + 1;

    state.waitingReturn = false;
    state.applyIndex = nextIndex;
    saveState(state);

    if (nextIndex >= applying.length) {
      state.status = 'done';
      state.finishedAt = new Date().toISOString();
      appendLog(state, 'Processo concluído.');
      saveState(state);
      localStorage.setItem(REPORT_WINDOW_KEY, '1');
      renderPanel();
      openReportModal(state);
      return;
    }

    location.href = applying[nextIndex].url;
  }

  function resumeAutomation(state) {
    if (!state || state.status === 'done') return;

    if (isWeekFormPage()) {
      renderPanel();
      return;
    }

    if (!isWeeksPage()) {
      alert('Abra a página de semanas da turma para continuar a automação.');
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
        return;
      }
      saveState(state);
      location.href = nextWeek.url;
      return;
    }

    if (state.status === 'applying') {
      if (state.waitingReturn) {
        continueFromWeeksPage(state);
        return;
      }

      const nextWeek = (state.applyWeeks || state.weeks)[state.applyIndex];
      if (!nextWeek) {
        state.status = 'done';
        state.finishedAt = new Date().toISOString();
        appendLog(state, 'Processo concluído na retomada.');
        saveState(state);
        localStorage.setItem(REPORT_WINDOW_KEY, '1');
        renderPanel();
        openReportModal(state);
        return;
      }

      saveState(state);
      location.href = nextWeek.url;
    }
  }


function openWeekSelectionModal() {
  if (!isWeeksPage()) return alert('Abra a lista de semanas da turma.');
  const weeks = parseWeeksTable();
  if(!weeks.length) return alert('Nenhuma semana encontrada.');
  qs('#'+CONFIG.modalId)?.remove();
  const modal=document.createElement('div');
  modal.id=CONFIG.modalId;
  modal.innerHTML=`
    <div class="vm-modal-box" style="max-width:720px">
      <h3>Selecionar semanas para preencher</h3>
      <p style="font-size:13px">Serão lidas todas as semanas para identificar habilidades já utilizadas. Somente as semanas marcadas receberão complementos.</p>
      <div class="vm-modal-actions">
        <button type="button" data-pick="all">Todas</button>
        <button type="button" data-pick="none">Nenhuma</button>
        <button type="button" data-pick="new">Só semanas sem plano</button>
      </div>
      <div style="max-height:42vh;overflow:auto;padding:8px;border:1px solid #ddd">
        ${weeks.map((w)=>`
        <label style="display:flex;gap:8px;align-items:center;padding:7px;border-bottom:1px solid #eee">
          <input type="checkbox" data-vm-week="${w.week}" checked>
          <b>Semana ${w.week}</b><span>${escapeHtml(w.period||'')} · ${escapeHtml(w.statusLabel||'')}</span>
        </label>`).join('')}
      </div>
      <div class="vm-modal-actions" style="margin-top:12px">
        <button class="vm-primary" type="button" data-start-selected>Mapear e completar selecionadas</button>
        <button class="vm-secondary" type="button" data-cancel>Cancelar</button>
      </div>
    </div>`;
  modal.onclick=(event)=>{
    if(event.target===modal || event.target.closest('[data-cancel]')){modal.remove();return;}
    const pick=event.target.closest('[data-pick]')?.dataset.pick;
    if(pick){
      modal.querySelectorAll('[data-vm-week]').forEach((checkbox)=>{
        const week=weeks.find((w)=>w.week===Number(checkbox.dataset.vmWeek));
        checkbox.checked=pick==='all'||(pick==='new' && /\/new(?:\?|$)/.test(week?.url||''));
      });
    }
    if(event.target.closest('[data-start-selected]')){
      const selected=Array.from(modal.querySelectorAll('[data-vm-week]:checked')).map((c)=>Number(c.dataset.vmWeek));
      if(!selected.length)return alert('Selecione pelo menos uma semana.');
      const existing=loadState();
      if(existing && existing.status!=='done')return alert('Há uma execução em andamento. Termine-a ou use Parar e limpar.');
      const state=buildStateFromCurrentWeeksPage();
      state.selectedWeeks=selected;
      appendLog(state,'Automação iniciada com semanas escolhidas.',{selectedWeeks:selected,readWeeks:state.weeks.length});
      saveState(state);
      modal.remove();
      renderPanel();
      location.href=state.weeks[0].url;
    }
  };
  document.body.appendChild(modal);
}

  function buildStateFromCurrentWeeksPage() {
    const parsedWeeks = parseWeeksTable();
    const weeks = CONFIG.maxWeeksPerRun ? parsedWeeks.slice(0, CONFIG.maxWeeksPerRun) : parsedWeeks;
    const classroomId = getCurrentClassroomId() || getUrl(weeks[0]?.url || '')?.searchParams.get('classroom_id') || null;

    return {
      version: 2,
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
    if (state.version !== 2 && state.status !== 'done') {
      return 'Execução antiga: use Parar e limpar antes de iniciar a versão 1.6.';
    }

    if (state.status === 'scanning') {
      return `Mapeando semanas ${state.scanIndex}/${state.weeks.length}`;
    }
    if (state.status === 'applying') {
      return `Aplicando preenchimento ${state.applyIndex}/${(state.applyWeeks || state.weeks).length}`;
    }
    if (state.status === 'done') {
      return `Concluído. Semanas com lacunas processadas: ${state.computed?.weeksToFill ?? state.weeks.length}`;
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
    const scanning = state.status === 'scanning';
    const stageWeeks = scanning ? state.weeks : (state.applyWeeks || state.weeks);
    const stageTotal = Math.max(1,stageWeeks.length);
    const index = Math.min(stageTotal, Math.max(0, scanning ? (state.scanIndex || 0) : (state.applyIndex || 0)));
    const percent = Math.round((scanning ? 0 : 50) + 50 * index / stageTotal);
    const current = stageWeeks[Math.min(index, stageWeeks.length - 1)];
    return {
      percent,
      label: (scanning ? 'Mapeamento' : 'Preenchimento') + ': ' + index + '/' + stageTotal + ' semanas',
      week: current ? ('Semana ' + current.week + (current.period ? ' · ' + current.period : '')) : '—'
    };
  }

  function getClassroomDisplay(state) {
    const id = state?.classroomId || getCurrentClassroomId();
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
    const canStart = isWeeksPage() && !state;
    const canResume = isWeeksPage() && !!state && state.version === 2 && state.status !== 'done';
    const canShowReport = !!state?.reportRows?.length;

    panel.innerHTML = `
      <div class="vm-head">Plano semanal automático</div>
      <div class="vm-body">
        <div><strong>Turma:</strong> ${escapeHtml(getClassroomDisplay(state))}</div>
        <div style="margin-top:6px;"><strong>Status:</strong> ${escapeHtml(getSummaryText(state))}</div>
        <div style="margin-top:6px;"><strong>Atual:</strong> ${escapeHtml(progress.week)}</div>
        <div style="margin-top:9px;display:flex;justify-content:space-between;gap:8px;"><span>${escapeHtml(progress.label)}</span><strong>${progress.percent}%</strong></div>
        <div class="vm-progress-track" role="progressbar" aria-label="Progresso da automação" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}">
          <div class="vm-progress-fill" style="width:${progress.percent}%"></div>
        </div>
        <div class="vm-actions">
          ${canStart ? '<button class="vm-primary" data-vm-action="start">Selecionar semanas</button>' : ''}
          ${(isWeeksPage() || isClassroomsPage()) ? '<button class="vm-secondary" data-vm-action="delete-manager">Gerenciar exclusões</button>' : ''}
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
        openWeekSelectionModal();
        return;
      }

      if (action === 'resume') {
        const currentState = loadState();
        if (currentState) resumeAutomation(currentState);
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
      const header = ['Semana', 'Data', 'Disciplina', 'Tipo', 'Habilidade', 'Objeto', 'Metodologias', 'Avaliação', 'Conteúdo manual'];
      const lines = [header.join(';')].concat(
        state.reportRows.map((row) => [
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
    if (state.version !== 2 && state.status !== 'done') {
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

      if (state.status === 'applying' && isWeekFormPage()) {
        await handleApplyPage(state);
        return;
      }

      if (state.status === 'applying' && isWeeksPage()) {
        continueFromWeeksPage(state);
      }
    } catch (error) {
      appendLog(state, 'Automação interrompida por erro.', { error: error.message });
      saveState(state);
      renderPanel();
      alert(`A automação foi interrompida: ${error.message}`);
      throw error;
    }
  }

  bootstrapAutomation();
})();