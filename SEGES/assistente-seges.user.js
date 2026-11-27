// ==UserScript==
// @name         SEGES • Assistente — Faltas, Planos e Notas
// @namespace    https://github.com/arthurhenriquetb/repo4htba
// @version      3.5.0
// @description  Faltas, planejamento e notas Excel no SEGES, com revisão antes de lançar.
// @author       Prof. Arthur
// @contributor  Prof. Samuel Louzada (módulo de notas, versão 2.7)
// @match        https://seges.sedu.es.gov.br/*
// @run-at       document-idle
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
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
  } else if (/^\/grades(?:\/|$)/.test(path)) {
    iniciarModuloNotas();
  } else if (/^\/(?:scores|marks)(?:\/|$)/.test(path)) {
    // Páginas não usadas pelo módulo Excel de notas.
  }

  function iniciarModuloNotas() {
  'use strict';
  // Integrado do SEGES Autofill v2.7 — Prof. Samuel Louzada.
  // Mantém categorias/sinônimos/colunas originais, com revisão antes de preencher.
  if(window!==window.top||!new URLSearchParams(location.search).has('classroom_id'))return;
  if(document.getElementById('seges-grades-assistant'))return;

  const CATEGORIES=[
    {key:'CONCEITUAL',synonyms:['CONCEITUAL','PROVA'],excel:[1,2]},
    {key:'PROCEDIMENTAL',synonyms:['TRABALHOS','PROCEDIMENTAL','TRABALHOS INDIVIDUAIS','SEMINÁRIOS','PORTIFOLIOS','PORTFÓLIOS'],excel:[5,6]},
    {key:'ATITUDINAL',synonyms:['ATITUDINAL','OUTROS'],excel:[9,10]},
    {key:'INTERDISCIPLINAR',synonyms:['INTERDISCIPLINAR','DIVERSIFICADA','TRABALHOS EM GRUPO'],excel:[13,14]}
  ];
  const normalize=value=>String(value??'').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
  const html=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const host=document.createElement('div');
  host.id='seges-grades-assistant';
  host.style.setProperty('all','initial','important');
  // O 'all:initial' inline prevalece sobre estilos dentro do Shadow DOM;
  // portanto a geometria também deve ser definida inline como !important.
  function layoutHost(open){
    const properties={
      position:'fixed',top:open?'0':'12px',right:open?'0':'12px',
      left:open?'0':'auto',bottom:open?'0':'auto',
      width:open?'100vw':'auto',height:open?'100vh':'auto',
      display:'block',visibility:'visible',opacity:'1',
      overflow:open?'hidden':'visible','z-index':'2147483647'
    };
    for(const [name,value] of Object.entries(properties))
      host.style.setProperty(name,value,'important');
  }
  layoutHost(false);
  const shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML=`
    <style>
      :host{all:initial!important;position:fixed!important;top:12px!important;right:12px!important;
        z-index:2147483647!important;display:block!important;font:13px/1.4 Arial,sans-serif!important}
      :host([data-open="true"]){top:0!important;right:0!important;bottom:0!important;left:0!important;
        width:100vw!important;height:100vh!important;overflow:hidden!important}
      *{box-sizing:border-box}
      [hidden]{display:none!important}
      button,input{font:inherit}
      button{cursor:pointer;background:#e7eff6;color:#20425e;border:1px solid #c7d7e4;
        border-radius:7px;padding:8px 11px}
      button:disabled{opacity:.45;cursor:not-allowed}
      .primary{background:#17699e!important;border-color:#17699e!important;color:#fff!important}
      #launcher{display:flex;gap:10px;align-items:center;background:white;padding:11px;
        color:#253e52;border:1px solid #bfcfdb;border-radius:10px;box-shadow:0 6px 22px #0003}
      #workspace{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;
        background:#eef3f8;color:#263e50}
      header{background:#135b8e;color:white;padding:10px 16px;display:flex;
        justify-content:space-between;align-items:center}
      header button{background:#fff}
      main{width:min(1200px,100%);margin:auto;flex:1;min-height:0;overflow:auto;padding:14px}
      section{background:white;padding:17px;border:1px solid #d7e4ed;border-radius:11px;margin-bottom:12px}
      h2{font-size:18px;margin:0 0 8px}h3{font-size:16px;margin:0 0 8px}
      .hint{color:#587084;font-size:12px;line-height:1.5}
      .actions{display:flex;gap:9px;flex-wrap:wrap;margin:12px 0}
      .actions.end{justify-content:flex-end}
      .status{padding:9px 0;border-top:1px solid #dde7ee;white-space:pre-wrap;overflow-wrap:anywhere}
      .tablewrap{max-height:56vh;overflow:auto;border:1px solid #dbe5ed;border-radius:8px}
      table{border-collapse:collapse;width:100%;font-size:12px}
      th,td{border-bottom:1px solid #e1eaf1;padding:8px;text-align:left}
      th{background:#f1f6fa;position:sticky;top:0}
      .right{text-align:right;font-variant-numeric:tabular-nums}
      .warn{color:#955c20;white-space:pre-wrap}
      @media(max-width:700px){main{padding:5px}section{padding:10px}header{padding:7px}}
    </style>
    <div id="launcher"><strong>SEGES • Notas</strong><button id="open" class="primary">Importar Excel</button></div>
    <div id="workspace" hidden>
      <header><strong>SEGES • Assistente — Notas</strong><button id="close">Fechar</button></header>
      <main>
        <section>
          <h2>Importar notas da planilha</h2>
          <p class="hint">Módulo baseado no SEGES Autofill v2.7 (Prof. Samuel Louzada).
            Confira se a turma aberta é a mesma da planilha.</p>
          <p><label>Arquivo Excel (.xlsx): <input id="file" type="file" accept=".xlsx"></label></p>
          <p id="filename" class="hint">Nenhum arquivo selecionado.</p>
          <p class="hint">Primeira aba · Conceitual B/C · Procedimental F/G ·
            Atitudinal J/K · Interdisciplinar N/O (avaliação / recuperação).</p>
          <div id="categories" class="actions"></div>
          <div id="status" class="status" role="status">Carregue um arquivo para começar.</div>
        </section>
        <section id="preview" hidden>
          <h3 id="preview-title">Conferir notas</h3>
          <p id="summary" class="hint"></p>
          <div class="tablewrap"><table>
            <thead><tr><th>Estudante</th><th class="right">Avaliação</th>
              <th class="right">Recuperação</th><th>Alterações</th></tr></thead>
            <tbody id="preview-body"></tbody>
          </table></div>
          <p id="warnings" class="warn hint"></p>
          <p class="hint">As notas são arredondadas, como no script original.
            Células vazias do Excel não apagam notas existentes.
            O SEGES pode salvar automaticamente ao receber as alterações dos campos.</p>
          <div class="actions end">
            <button id="back">Voltar</button>
            <button id="apply" class="primary">Aplicar notas conferidas</button>
          </div>
        </section>
      </main>
    </div>`;
  document.documentElement.appendChild(host);
  const $=sel=>shadow.querySelector(sel);
  const $$=sel=>Array.from(shadow.querySelectorAll(sel));
  let data=null,proposal=null,busy=false;

  function status(text){$('#status').textContent=String(text)}
  function displayWorkspace(open){
    if(busy)return;
    layoutHost(!!open);
    host.setAttribute('data-open',String(!!open));
    $('#launcher').hidden=!!open;
    $('#workspace').hidden=!open;
  }
  function normalizeGrade(raw){
    if(raw==null||String(raw).trim()==='')return {status:'blank'};
    const literal=typeof raw==='number'?raw:String(raw).replace(/\s/g,'').replace(',','.');
    if(typeof literal==='string'&&!/^[+-]?\d+(?:\.\d+)?$/.test(literal))return {status:'invalid'};
    const numeric=Number(literal);
    return Number.isFinite(numeric)?{status:'valid',value:Math.round(numeric)}:{status:'invalid'};
  }
  function findGroup(category){
    for(const table of document.querySelectorAll('table')){
      const head=table.querySelector('thead tr:first-child');
      if(!head||!table.querySelector('tbody tr'))continue;
      let index=0;
      for(const th of head.querySelectorAll('th')){
        const span=Math.max(1,parseInt(th.getAttribute('colspan')||'1',10)||1);
        const title=normalize(th.innerText||th.textContent);
        const isGroup=category.synonyms.some(s=>title.includes(normalize(s)));
        const wrongProcedural=category.key==='PROCEDIMENTAL'&&
          title.includes('TRABALHOS EM GRUPO')&&!title.includes('PROCEDIMENTAL');
        if(isGroup&&!wrongProcedural&&span>=2)return {table,start:index,title};
        index+=span;
      }
    }
    return null;
  }
  function prepare(category){
    if(!data)throw Error('Carregue primeiro a planilha.');
    const group=findGroup(category);
    if(!group)throw Error('Grupo '+category.key+' não encontrado no cabeçalho do SEGES.');
    const rows=Array.from(group.table.querySelectorAll('tbody tr')).filter(tr=>
      tr.cells?.length>group.start+1&&tr.cells[1]);
    const site=new Map();
    for(const tr of rows){
      const name=normalize(tr.cells[1].innerText||tr.cells[1].textContent);
      if(!name)continue;
      if(!site.has(name))site.set(name,[]);
      site.get(name).push(tr);
    }
    const sheetCounts=new Map();
    for(const r of data.slice(1)){
      const name=normalize(r?.[0]);if(name)sheetCounts.set(name,(sheetCounts.get(name)||0)+1);
    }
    const entries=[],problems=[],changes=[];
    let missing=0,duplicates=0,invalid=0,replacements=0;
    for(let i=1;i<data.length;i++){
      const r=data[i]||[],name=normalize(r[0]);
      if(!name)continue;
      if(sheetCounts.get(name)>1||site.get(name)?.length>1){
        duplicates++;problems.push('Linha '+(i+1)+': nome repetido ('+name+')');continue;
      }
      const tr=site.get(name)?.[0];
      if(!tr){missing++;problems.push('Linha '+(i+1)+': não encontrado ('+name+')');continue;}
      const values=category.excel.map(col=>normalizeGrade(r[col]));
      const labels=[];
      values.forEach((value,j)=>{
        if(value.status==='blank'){labels.push((j?'Recuperação':'Avaliação')+': vazia');return;}
        if(value.status==='invalid'){
          invalid++;labels.push((j?'Recuperação':'Avaliação')+': inválida');
          problems.push('Linha '+(i+1)+': nota inválida');return;
        }
        const cell=tr.cells[group.start+j];
        const input=cell?.querySelector('input[type="number"], input[type="text"]');
        if(!input||input.disabled||input.readOnly){
          problems.push('Linha '+(i+1)+': campo indisponível ('+(j?'Recuperação':'Avaliação')+')');
          return;
        }
        const old=String(input.value||'').trim(),fresh=String(value.value);
        if(old===fresh){labels.push('Sem alteração');return;}
        if(old)replacements++;
        changes.push({tr,input,name,old,value:fresh,category:category.key});
        labels.push((j?'Recuperação':'Avaliação')+(old?' — substituir '+old:' — preencher'));
      });
      entries.push({name,values,labels});
    }
    return {category,group,entries,changes,problems,missing,duplicates,invalid,replacements};
  }
  function showPreview(plan){
    proposal=plan;
    $('#preview').hidden=false;
    $('#preview-title').textContent='Conferir '+plan.category.key+' — '+plan.group.title;
    $('#summary').textContent=plan.entries.length+' estudante(s) correspondentes, '+
      plan.changes.length+' nota(s) a preencher, '+plan.replacements+
      ' valor(es) já preenchido(s) a substituir, '+plan.missing+
      ' não encontrado(s), '+plan.duplicates+' duplicado(s), '+
      plan.invalid+' valor(es) inválido(s).';
    $('#preview-body').innerHTML=plan.entries.map(entry=>
      '<tr><td>'+html(entry.name)+'</td>'+
      entry.values.map(v=>'<td class="right">'+(v.status==='valid'?String(v.value):'—')+'</td>').join('')+
      '<td>'+html(entry.labels.join(' · ')||'Sem alteração')+'</td></tr>'
    ).join('')||'<tr><td colspan="4">Nenhum estudante correspondente.</td></tr>';
    $('#warnings').textContent=plan.problems.slice(0,30).join('\n')+
      (plan.problems.length>30?'\n... e mais '+(plan.problems.length-30)+' aviso(s).':'');
    $('#apply').disabled=!plan.changes.length;
    status('Confira os dados. Nenhuma nota foi preenchida ainda.');
    $('#preview').scrollIntoView({block:'start',behavior:'smooth'});
  }
  function scrollToInput(el){
    let wrap=el.parentElement;
    while(wrap&&wrap!==document.body){
      const style=getComputedStyle(wrap);
      if(/auto|scroll/.test(style.overflow+' '+style.overflowX+' '+style.overflowY))break;
      wrap=wrap.parentElement;
    }
    if(wrap&&wrap.scrollWidth>wrap.clientWidth){
      const a=el.getBoundingClientRect(),b=wrap.getBoundingClientRect();
      wrap.scrollLeft+=(a.left+a.width/2)-(b.left+b.width/2);
      wrap.scrollTop+=(a.top+a.height/2)-(b.top+b.height/2);
    }
  }
  function applyGrades(){
    const plan=proposal;
    if(!plan||!plan.changes.length||busy)return;
    if(!document.documentElement.contains(plan.group.table)){
      status('A tabela do SEGES mudou; confira a prévia novamente.');return;
    }
    if(!window.confirm('Aplicar '+plan.changes.length+' nota(s) de '+plan.category.key+
      ' nesta turma?\n'+plan.replacements+' valor(es) existente(s) serão substituídos.'+
      '\nO SEGES pode salvar automaticamente.'))return;
    busy=true;
    $('#apply').disabled=true;
    let done=0,skipped=0;
    try{
      for(const change of plan.changes){
        if(!document.documentElement.contains(change.input)||change.input.disabled||
           change.input.readOnly||String(change.input.value||'').trim()!==change.old||
           normalize(change.tr.cells?.[1]?.innerText||change.tr.cells?.[1]?.textContent)!==change.name){
          skipped++;continue;
        }
        scrollToInput(change.input);
        change.input.focus();
        change.input.value=change.value;
        change.input.dispatchEvent(new Event('input',{bubbles:true}));
        change.input.dispatchEvent(new Event('change',{bubbles:true}));
        change.input.blur();
        done++;
      }
      status(plan.category.key+': '+done+' campo(s) preenchido(s). '+
        skipped+' ignorado(s) por terem mudado desde a revisão. '+
        'Confira os registros e eventual salvamento no SEGES.');
      proposal=null;
      $('#preview').hidden=true;
    }catch(err){status('Interrompido após '+done+' alteração(ões): '+String(err?.message||err));}
    finally{busy=false;}
  }
  async function readExcel(file){
    if(!file)return;
    busy=true;proposal=null;data=null;
    $('#preview').hidden=true;
    $$('[data-category]').forEach(b=>b.disabled=true);
    status('Lendo planilha...');
    try{
      if(!/\.xlsx$/i.test(file.name))throw Error('Escolha um arquivo .xlsx.');
      if(typeof XLSX==='undefined')throw Error('Biblioteca XLSX indisponível. Recarregue a página com acesso à internet.');
      const array=await file.arrayBuffer();
      const wb=XLSX.read(array,{type:'array'});
      const first=wb.SheetNames?.[0];
      if(!first)throw Error('Planilha sem abas.');
      const table=XLSX.utils.sheet_to_json(wb.Sheets[first],{header:1,defval:''});
      if(table.length<2)throw Error('Nenhum registro após o cabeçalho.');
      data=table;
      $('#filename').textContent=file.name+' · aba '+first+' · '+(table.length-1)+' registro(s).';
      $$('[data-category]').forEach(b=>b.disabled=false);
      status('Planilha lida. Selecione uma categoria para revisar as notas.');
    }catch(err){
      $('#filename').textContent='Falha na importação.';
      status('Erro: '+String(err?.message||err));
    }finally{busy=false;}
  }
  $('#categories').innerHTML=CATEGORIES.map(c=>
    '<button type="button" data-category="'+c.key+'" disabled>Conferir '+c.key+'</button>').join('');
  $('#open').onclick=()=>displayWorkspace(true);
  $('#close').onclick=()=>displayWorkspace(false);
  $('#back').onclick=()=>{proposal=null;$('#preview').hidden=true;status('Escolha uma categoria.');};
  $('#apply').onclick=applyGrades;
  $('#file').addEventListener('change',event=>readExcel(event.target.files?.[0]));
  $('#categories').addEventListener('click',event=>{
    const button=event.target.closest('[data-category]');
    if(!button||button.disabled||busy)return;
    const cat=CATEGORIES.find(c=>c.key===button.dataset.category);
    if(!cat)return;
    try{showPreview(prepare(cat));}
    catch(err){proposal=null;$('#preview').hidden=true;status('Erro: '+String(err?.message||err));}
  });
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
  // Um Shadow DOM isolado impede o CSS do próprio SEGES de reduzir ou esconder
  // a janela de revisão. Consultas globais priorizam os controles dessa janela.
  let areaTrabalhoHost = null, areaTrabalhoShadow = null;
  const $ = (sel, root=document) => {
    if(root===document && areaTrabalhoShadow){
      const el=areaTrabalhoShadow.querySelector(sel);
      if(el)return el;
    }
    return root.querySelector(sel);
  };
  const $$ = (sel, root=document) => {
    if(root===document && areaTrabalhoShadow){
      const nodes=Array.from(areaTrabalhoShadow.querySelectorAll(sel));
      if(nodes.length)return nodes;
    }
    return Array.from(root.querySelectorAll(sel));
  };
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
    if(quadro){fecharModal();}
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
    const front=$('#seges-v3-modal-status');
    if(front)front.textContent=msg;
    log(msg);
  }
  function atualizarProgresso() {
    const valor=progresso.total ? Math.round(100*progresso.atual/progresso.total):0;
    const fill=$('#seges-v3-progress'),label=$('#seges-v3-percentage');
    if(fill)fill.style.width=valor+'%';
    if(label)label.textContent=valor+'%';
    const front=$('#seges-v3-modal-progress-fill');
    if(front)front.style.width=valor+'%';
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
    const old=$('#seges-v3-style');
    if(old?.dataset.segesVersion==='3.3.0')return;
    old?.remove();
    const style=document.createElement('style');
    style.id='seges-v3-style';
    style.dataset.segesVersion='3.3.0';
    style.textContent=`
      #seges-v3-panel{position:fixed;right:12px;top:90px;width:320px;max-width:calc(100vw - 20px);max-height:80vh;overflow:auto;background:white;border-radius:12px;border:1px solid #c8d4df;box-shadow:0 6px 26px #0003;z-index:2147483630;font:13px/1.45 Arial,sans-serif;color:#273e52}
      #seges-v3-panel .head{background:#135b8e;color:white;padding:12px 14px;font-weight:bold;cursor:grab;user-select:none;touch-action:none}
      #seges-v3-panel .body{padding:12px}
      #seges-v3-panel button,#seges-v3-overlay button{cursor:pointer;border:0;border-radius:7px;padding:8px 11px;background:#e7eff6;color:#20425e;font:inherit}
      #seges-v3-panel button.primary,#seges-v3-overlay button.primary{background:#17699e;color:#fff}
      #seges-v3-panel button.danger,#seges-v3-overlay button.danger{background:#be3e43;color:#fff}
      #seges-v3-panel button:disabled,#seges-v3-overlay button:disabled{opacity:.45;cursor:default}
      #seges-v3-overlay{position:fixed;inset:0;background:#15243ab0;z-index:2147483640;display:flex;align-items:center;justify-content:center;padding:15px;font:13px/1.4 Arial,sans-serif;color:#283d52}
      #seges-v3-overlay .seges-v3-dialog{background:white;border-radius:12px;padding:17px;max-width:min(1080px,97vw);max-height:92vh;overflow:auto;width:100%;box-shadow:0 8px 40px #1115}
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
      /* ÚNICA JANELA: o próprio painel vira uma área de trabalho grande.
         Não há outro modal por trás de camadas escuras do SEGES. */
      #seges-v3-panel[data-seges-view="workspace"] {
        position:fixed!important;left:0!important;top:0!important;
        right:0!important;bottom:0!important;
        width:100vw!important;height:100vh!important;
        max-width:none!important;max-height:none!important;
        margin:0!important;transform:none!important;
        display:flex!important;flex-direction:column!important;
        visibility:visible!important;opacity:1!important;
        overflow:hidden!important;border-radius:0!important;
        border:0!important;z-index:2147483647!important;
        background:#eff3f8!important;
      }
      #seges-v3-panel[data-seges-view="workspace"] > .head {
        flex:0 0 auto!important;cursor:default!important;
        padding:10px 16px!important;
      }
      #seges-v3-panel[data-seges-view="workspace"] > .body {display:none!important}
      #seges-v3-panel[data-seges-view="workspace"] > #seges-v3-overlay {
        position:relative!important;inset:auto!important;
        display:flex!important;flex:1 1 auto!important;
        align-items:flex-start!important;justify-content:center!important;
        width:100%!important;height:auto!important;
        min-height:0!important;max-width:none!important;
        max-height:none!important;padding:14px!important;
        margin:0!important;box-sizing:border-box!important;
        visibility:visible!important;opacity:1!important;
        overflow:auto!important;z-index:auto!important;
        background:transparent!important;
      }
      #seges-v3-panel[data-seges-view="workspace"] #seges-v3-overlay .seges-v3-dialog {
        display:block!important;position:relative!important;
        width:100%!important;max-width:1200px!important;
        max-height:none!important;min-width:0!important;
        margin:0 auto!important;flex-shrink:0!important;
        box-sizing:border-box!important;visibility:visible!important;
        background:#fff!important;color:#283d52!important;
      }
    `;
    document.head.appendChild(style);
  }
  function painel() {
    estilos();
    const previous=$('#seges-v3-panel');
    if(previous?.dataset.segesVersion==='3.3.0')return;
    // Substituir launcher antigo quando outra cópia do userscript
    // foi executada antes da versão atual nesta mesma página.
    if(previous){
      previous.remove();
      $('#seges-v3-overlay')?.remove();
    }
    const el=document.createElement('div');
    el.id='seges-v3-panel';
    el.dataset.segesVersion='3.3.0';
    el.innerHTML=`<div class="head">SEGES • Assistente v3.5.0 — Planos</div><div class="body">
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
      if(el.dataset.segesView==='workspace')return;
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
  function fecharModal() {
    if(areaTrabalhoHost)areaTrabalhoHost.remove();
    areaTrabalhoHost=null;
    areaTrabalhoShadow=null;
    quadro=null;
    const panel=document.querySelector('#seges-v3-panel');
    if(panel)panel.style.removeProperty('display');
  }
  function modal(content) {
    // Não ampliar o painel pequeno: abrir uma área própria, isolada do CSS do SEGES.
    // A interface inteira fica no Shadow DOM e nunca herda regras de layout externas.
    fecharModal();
    const panel=document.querySelector('#seges-v3-panel');
    if(!panel)throw Error('Painel do assistente ausente. Recarregue a página do SEGES.');
    const host=document.createElement('div');
    host.id='seges-v331-workspace-host';
    const fixed={
      all:'initial',position:'fixed',top:'0',left:'0',right:'0',bottom:'0',
      width:'100vw',height:'100vh',margin:'0',padding:'0',
      display:'block',visibility:'visible',opacity:'1',
      'box-sizing':'border-box',overflow:'hidden','z-index':'2147483647'
    };
    for(const [property,value] of Object.entries(fixed))
      host.style.setProperty(property,value,'important');
    const shadow=host.attachShadow({mode:'open'});
    shadow.innerHTML=`<style>
      :host {all:initial!important;position:fixed!important;inset:0!important;
        display:block!important;width:100vw!important;height:100vh!important;
        max-width:none!important;max-height:none!important;z-index:2147483647!important;
        visibility:visible!important;opacity:1!important;overflow:hidden!important}
      *,*::before,*::after{box-sizing:border-box}
      #seges-v3-overlay{position:absolute;inset:0;display:flex;align-items:stretch;
        justify-content:center;padding:12px;width:100%;height:100%;overflow:auto;
        background:#eef2f8;font:13px/1.45 Arial,sans-serif;color:#283d52}
      #seges-v3-overlay .seges-v3-dialog{position:relative;display:block;
        width:100%;max-width:1220px;min-width:0;min-height:0;
        height:fit-content;max-height:none;padding:18px;margin:0 auto;
        background:#fff;border-radius:12px;border:1px solid #d7e1eb;
        box-shadow:0 8px 35px #1b2e4a2b;color:#283d52;overflow:visible}
      #seges-v3-overlay h3{font-size:18px;line-height:1.3;margin:0 0 12px}
      #seges-v3-overlay p{margin:8px 0}
      #seges-v3-overlay .hint{font-size:12px;color:#576a7d;line-height:1.5}
      #seges-v3-overlay .actions{display:flex;gap:8px;justify-content:flex-end;
        flex-wrap:wrap;margin-top:14px}
      #seges-v3-overlay button{cursor:pointer;border:1px solid #d1dce8;
        border-radius:7px;background:#e7eff6;color:#20425e;
        padding:8px 12px;font:inherit;min-height:32px}
      #seges-v3-overlay button.primary{background:#17699e;color:white;border-color:#17699e}
      #seges-v3-overlay button.danger{background:#be3e43;color:white;border-color:#be3e43}
      #seges-v3-overlay button:disabled{opacity:.5;cursor:not-allowed}
      #seges-v3-overlay .scroll{width:100%;max-height:55vh;overflow:auto;
        border:1px solid #dce5ec;border-radius:8px}
      #seges-v3-overlay table{width:100%;border-collapse:separate;
        border-spacing:0;font:12px/1.4 Arial,sans-serif}
      #seges-v3-overlay th,#seges-v3-overlay td{padding:7px;border-bottom:1px solid #e3eaf0;
        text-align:center;white-space:nowrap}
      #seges-v3-overlay th{background:#f1f5f9;position:sticky;top:0;z-index:2}
      #seges-v3-overlay td:first-child,#seges-v3-overlay th:first-child{
        position:sticky;left:0;z-index:3;background:#fff;text-align:left}
      #seges-v3-overlay th:first-child{z-index:4;background:#f1f5f9}
      #seges-v3-overlay input,#seges-v3-overlay select,#seges-v3-overlay textarea{
        color:#283d52;background:#fff;font:inherit;border:1px solid #c5d4e0;
        border-radius:6px;padding:6px;max-width:100%}
      #seges-v3-overlay input[type=checkbox]{width:16px;height:16px;
        padding:0;accent-color:#156da1}
      #seges-v3-overlay label{cursor:pointer}
      #seges-v3-overlay strong{font-weight:700}
      @media(max-width:700px){#seges-v3-overlay{padding:5px}
        #seges-v3-overlay .seges-v3-dialog{padding:11px;border-radius:4px}
        #seges-v3-overlay h3{font-size:16px}}
    </style>
    <section id="seges-v3-overlay" role="dialog" aria-modal="true"
      aria-label="SEGES Assistente — Área de trabalho">
      <div class="seges-v3-dialog" role="document">
        <div id="seges-v3-modal-progress" style="padding:6px 0 10px;margin-bottom:11px;
          border-bottom:1px solid #dce5ef;font-size:12px">
          <div id="seges-v3-modal-status" style="overflow-wrap:anywhere">Preparando...</div>
          <div style="margin-top:6px;height:7px;background:#e4edf3;
            border-radius:7px;overflow:hidden">
            <div id="seges-v3-modal-progress-fill" style="height:100%;width:0;
              background:#17699e"></div>
          </div>
        </div>
        ${content}
      </div>
    </section>`;
    document.documentElement.appendChild(host);
    areaTrabalhoHost=host;
    areaTrabalhoShadow=shadow;
    quadro=host;
    // Ocultar APENAS o launcher antigo, depois que a tela grande já existe.
    panel.style.setProperty('display','none','important');
    const lastStatus=document.querySelector('#seges-v3-status')?.textContent;
    const statusEl=shadow.querySelector('#seges-v3-modal-status');
    if(lastStatus&&statusEl)statusEl.textContent=lastStatus;
    atualizarProgresso();
    const container=shadow.querySelector('#seges-v3-overlay');
    if(!container)throw Error('A área de trabalho não pôde ser criada.');
    return container;
  }
  function baixar(name,content) {
    const blob=new Blob([content],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function diagnosticoErro(error,etapa,contexto) {
    const message=String(error?.message||error||'Erro sem descrição');
    // Evita copiar parâmetros de URL, que podem conter tokens de sessão.
    const trace=String(error?.stack||'')
      .split('\n').slice(0,9)
      .map(line=>line.replace(/(https?:\/\/[^\s?#)]+)\?[^\s)]+/g,'$1?[parâmetros ocultos]'))
      .join('\n');
    return [
      'SEGES • Assistente 3.5.0',
      'Etapa: '+String(etapa||'Não identificada'),
      'Plano: '+String(contexto||'Não identificado'),
      'Erro: '+message,
      'Rastreamento técnico (sem parâmetros de URL):',
      trace||'Não disponível'
    ].join('\n');
  }
  function falhar(error) {
    if(cancelado)return;
    const detail=diagnosticoErro(error,'Abertura ou leitura da tabela','Nenhuma exclusão enviada por esta tentativa');
    status('Interrompido: '+String(error?.message||error));
    encerrarOperacao();
    iframe?.remove();iframe=null;
    const root=modal(`<h3>Operação interrompida</h3>
      <p style="color:#a52b32">${html(String(error?.message||error))}</p>
      <p class="hint">A mensagem acima não permite identificar a causa sozinha.
      Copie o diagnóstico, que agora inclui a localização técnica do erro.
      Nenhum novo envio será tentado automaticamente.</p>
      <div class="actions">
        <button type="button" id="seges-v3-copy-general">Copiar diagnóstico</button>
        <button type="button" id="seges-v3-download-general">Baixar TXT</button>
        <button type="button" id="seges-v3-close-general">Fechar</button>
      </div>`);
    $('#seges-v3-copy-general',root).onclick=async()=>{
      try{await navigator.clipboard.writeText(detail);alert('Diagnóstico copiado.');}
      catch(_){baixar('seges-diagnostico.txt',detail);}
    };
    $('#seges-v3-download-general',root).onclick=()=>baixar('seges-diagnostico.txt',detail);
    $('#seges-v3-close-general',root).onclick=fecharModal;
  }
  async function buscarPagina(href) {
    verificarAtivo();
    const url=urlSeges(href);
    if(!url)throw Error('URL fora da área de planos do SEGES.');
    const parentSignal=controller?.signal;
    const requestController=new AbortController();
    const cancelRequest=()=>requestController.abort();
    if(parentSignal?.aborted)throw Error('A operação foi cancelada.');
    parentSignal?.addEventListener('abort',cancelRequest,{once:true});
    // Uma página que não responde não deve bloquear indefinidamente a revisão.
    const timeout=setTimeout(()=>requestController.abort(),15000);
    try{
      const response=await fetch(url.href,{
        method:'GET',credentials:'same-origin',cache:'no-store',
        signal:requestController.signal
      });
      verificarAtivo();
      const returned=urlSeges(response.url);
      if(!response.ok||!returned||!returned.pathname.startsWith(BASE))
        throw Error('Página do SEGES indisponível ou sessão expirada (HTTP '+response.status+').');
      const body=await response.text();
      verificarAtivo();
      const doc=new DOMParser().parseFromString(body,'text/html');
      if(!doc.querySelector('body'))throw Error('O SEGES devolveu uma página inválida.');
      return doc;
    }catch(error){
      if(cancelado||parentSignal?.aborted)throw Error('A operação foi cancelada.');
      if(requestController.signal.aborted)
        throw Error('Tempo de resposta excedido (15 segundos) ao consultar uma página do SEGES.');
      throw error;
    }finally{
      clearTimeout(timeout);
      parentSignal?.removeEventListener('abort',cancelRequest);
    }
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
    quadroAtual={stages:new Map(),review:null,methodOverrides:new Map(),manualTextOverrides:new Map(),freeTextOverrides:new Map()};
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
      .filter(opt=>String(opt.value).trim() && !/^(?:sem habilidade|nenhuma habilidade|selecione|escolha uma habilidade|--|-)$/
        .test(normal(opt.textContent))).map(opt=>({
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
      // $$ retorna sempre uma lista, mesmo quando a aula não possui
      // opções de metodologia. $ retornava null e causava erro em .filter().
      const availableMethods=$$('.structured-weekly-plan-methodologies-select option',tr)
        .filter(option=>String(option.value||'').trim())
        .map(option=>String(option.textContent||option.value).trim());
      return {index,discipline,date,kind,existingText,existingSkill,existingSkillLabel,hasKnowledge,hasMethod,evaluation,availableMethods,
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
    if(!selected.length){
      encerrarOperacao();
      alert('Marque ao menos uma semana.');
      return;
    }
    const button=$('#seges-v3-preview');
    if(button)button.disabled=true;
    try{
      const chosen=new Map();
      for(const cls of selected)for(const week of cls.weeks)
        chosen.set(cls.id+':'+week.week,{cls,week});
      // A barra não deve chegar a 100% antes de abrir a revisão.
      // Etapa 1 = 35%, históricos = 55%, montagem = 10%.
      progresso={atual:0,total:100};
      atualizarProgresso();
      let completed=0;
      for(const {cls,week} of chosen.values()){
        verificarAtivo();
        status('Etapa 1/3 — Lendo semanas escolhidas '+(completed+1)+'/'+chosen.size+
          ': '+cls.name+' · semana '+week.week);
        const form=await lerSemana(cls,week);
        completed++;
        progresso.atual=Math.round(35*completed/chosen.size);
        atualizarProgresso();
        if(!form.rows.length)
          log('Sem aulas: '+cls.name+' · semana '+week.week+' — ignorada (sem gravação).');
      }
      const warnings=[];
      const historyUnavailable=new Set();
      for(let index=0;index<selected.length;index++){
        const cls=selected[index];
        verificarAtivo();
        status('Etapa 2/3 — Histórico: turma '+(index+1)+'/'+selected.length+
          ' · '+cls.name);
        const activeWeeks=cls.weeks.filter(week=>
          (arquivos.get(cls.id+':'+week.week)?.rows?.length||0)>0);
        let newReads=0;
        const historicalGroups=new Map();
        for(const week of activeWeeks){
          verificarAtivo();
          const previous=registroAnterior(cls,week);
          const candidates=previous.slice(0,12);
          const groupKey=candidates.map(item=>item.week).join(',');
          let group=historicalGroups.get(groupKey);
          if(!group){
            group={found:0,consulted:0,cutoff:false,failed:0};
            for(const old of candidates){
              if(group.found>=5)break;
              verificarAtivo();
              group.consulted++;
              const key=cls.id+':'+old.week;
              if(historyUnavailable.has(key)){group.failed++;continue;}
              const cached=arquivos.has(key);
              try{
                const form=await lerSemana(cls,old);
                if(temPlano(form))group.found++;
                if(!cached)newReads++;
              }catch(error){
                if(cancelado||controller?.signal?.aborted)throw error;
                historyUnavailable.add(key);
                group.failed++;
                const why=String(error?.message||error).slice(0,140);
                warnings.push(cls.name+' · semana '+week.week+
                  ': histórico da semana '+old.week+' indisponível ('+why+').');
                log('Histórico ignorado por falha: '+cls.name+' · semana '+old.week+' — '+why);
              }
            }
            group.cutoff=group.found<5&&group.consulted>=12&&previous.length>group.consulted;
            historicalGroups.set(groupKey,group);
          }
          if(group.cutoff)warnings.push(cls.name+' · semana '+week.week+
            ': foram verificadas 12 semanas anteriores; apenas '+group.found+
            ' tinham planos. Sugestões precisam de conferência.');
        }
        progresso.atual=35+Math.round(55*(index+1)/selected.length);
        atualizarProgresso();
        status('Etapa 2/3 — Turma '+(index+1)+'/'+selected.length+
          ' concluída: '+cls.name+'; '+newReads+' leitura(s) nova(s).');
      }
      verificarAtivo();
      progresso.atual=94;
      atualizarProgresso();
      quadroAtual.selected=selected;
      quadroAtual.historyWarnings=warnings;
      quadroAtual.overrides=new Map();
      quadroAtual.methodOverrides=new Map();
      quadroAtual.previewPage=0;
      status('Etapa 3/3 — Montando sugestões e a tabela de revisão...');
      mostrarPrevia();
      if(!$('#seges-v3-overlay #seges-v3-approve'))
        throw Error('A revisão não abriu corretamente. Nenhum plano foi salvo.');
      progresso.atual=100;
      atualizarProgresso();
      status('Revisão pronta. Confira as sugestões antes de aprovar qualquer plano.');
    }catch(error){
      falhar(error);
    }finally{
      encerrarOperacao();
      const current=$('#seges-v3-preview');
      if(current && !cancelado && !quadroAtual?.review)
        current.disabled=false;
    }
  }
  function etapaCompativel(cls,options) {
  const known=String(cls?.stage||etapaNome(cls?.name)||'').trim();
  if(known)return known;
  const grades=new Set((options||[]).map(option=>classificarHabilidade(option.label)).filter(Boolean));
  return grades.size===1?[...grades][0]:'';
}

  function sugerirHabilidade(history,options,stage) {
  const valid=validasParaTurma(options,stage);
  if(!valid.length)return '';
  // Mesmo sem código EF/EM legível, sugerir a partir do dropdown e sinalizar
  // a incerteza na revisão, em vez de deixar todos os campos vazios.
  const safe=valid.some(opt=>!opt.manualOnly)?valid.filter(opt=>!opt.manualOnly):valid;
  if(!safe.length)return '';
  const recent=(history||[]).slice(0,5);
  const last=recent.map(entry=>entry.skill).find(Boolean);
  if(!last)return safe[0].value;
  const position=safe.findIndex(option=>mesmaHabilidade(option,last)||
    (String(option.value)===String(last.value)));
  const repetition=recent.filter(entry=>entry.skill&&mesmaHabilidade(entry.skill,last)).length;
  if(position>=0)return safe[Math.min(position+(repetition>=3?1:0),safe.length-1)].value;
  // Se o histórico usou outra lista, encontrar o ponto correspondente por
  // código curricular. Nunca retroceder ao início após a última habilidade.
  const priorCode=codigoHabilidade(last.label);
  if(priorCode){
    const indices=safe.map((option,index)=>({index,code:codigoHabilidade(option.label)}))
      .filter(item=>item.code);
    if(indices.length){
      const after=indices.find(item=>item.code>priorCode);
      if(after)return safe[after.index].value;
      return safe[indices[indices.length-1].index].value;
    }
  }
  // Sem correspondência semântica, manter a sugestão na última opção,
  // para não reiniciar indevidamente a sequência.
  return safe[safe.length-1].value;
}
  function chaveMetodologia(texto){
  const clean=normal(texto).replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  if(/\baula\b/.test(clean)&&/\bexpositiva\b/.test(clean)&&/\bdialogada\b/.test(clean))
    return 'aula-expositiva-dialogada';
  if(/\bresolucao\b/.test(clean)&&/\bexercicios\b/.test(clean))
    return 'resolucao-exercicios';
  return clean;
}

  function opcoesMetodologia(row,habilidade){
  const all=habilidade?.methodologies?.length?habilidade.methodologies:(row.availableMethods||[]);
  const seen=new Map();
  for(const item of all){
    const label=String(item||'').trim();
    const key=chaveMetodologia(label);
    if(label&&key&&!seen.has(key))seen.set(key,label);
  }
  return [...seen.values()];
}

  function sugerirMetodologias(available){
  const results=[];
  for(const sought of ['aula-expositiva-dialogada','resolucao-exercicios']){
    const found=(available||[]).find(item=>chaveMetodologia(item)===sought);
    if(found)results.push(found);
  }
  return results;
}

  function mapearMetodologias(nomes,available){
  return (nomes||[]).map(name=>(available||[]).find(item=>
    chaveMetodologia(item)===chaveMetodologia(name))).filter(Boolean)
    .filter((value,i,array)=>array.findIndex(other=>chaveMetodologia(other)===chaveMetodologia(value))===i);
}

  function gerarPropostas() {
  const selected=quadroAtual.selected||[];
  const suggested=[];
  const warnings=[...(quadroAtual.historyWarnings||[])];
  const contexts=selected.map(cls=>{
    const timeline=new Map();
    for(const form of arquivos.values()){
      if(form.cls.id!==cls.id||!form.week.existing||!temPlano(form))continue;
      timeline.set(form.week.week,{week:form.week.week,hasPlan:true,form,assignments:null});
    }
    return {cls,timeline};
  });
  const numbers=[...new Set(selected.flatMap(cls=>cls.weeks.map(week=>week.week)))]
    .sort((a,b)=>a-b);
  function skillFor(entry,discipline,ordinal) {
    if(entry.form)return habilidadeRecente(entry.form,discipline,ordinal);
    return entry.assignments?.get(normal(discipline)+'|'+ordinal)||null;
  }
  function referenceFor(line) {
    const choice=line.options.find(opt=>String(opt.value)===String(line.value));
    if(choice)return choice;
    if(line.row.existingSkill){
      return line.row.opts.find(opt=>String(opt.value)===String(line.row.existingSkill))||
        {value:String(line.row.existingSkill),label:line.row.existingSkillLabel||''};
    }
    return null;
  }
  for(const weekNumber of numbers){
    const stageLines=[];
    const processed=[];
    for(const context of contexts){
      const {cls,timeline}=context;
      const week=cls.weeks.find(item=>item.week===weekNumber);
      if(!week)continue;
      const form=arquivos.get(cls.id+':'+week.week);
      if(!form){
        warnings.push(cls.name+' · semana '+week.week+': formulário não encontrado.');
        continue;
      }
      if(!form.rows.length){
        warnings.push(cls.name+' · semana '+week.week+': sem aulas; ignorada automaticamente.');
        continue;
      }
      const ordinals=new Map();
      const lines=[];
      for(const row of form.rows){
        if(row.kind==='other'||(row.kind==='manual'&&row.existingText))continue;
        const disciplineKey=normal(row.discipline);
        const ordinal=ordinals.get(disciplineKey)||0;
        if(row.kind==='science')ordinals.set(disciplineKey,ordinal+1);
        const key=cls.id+':'+week.week+':'+row.index;
        const override=quadroAtual.overrides.has(key)?quadroAtual.overrides.get(key):undefined;
        const stage=etapaCompativel(cls,row.opts);
        const options=row.kind==='science'?validasParaTurma(row.opts,stage):[];
        const recent=[...timeline.values()].filter(item=>item.hasPlan&&item.week<week.week)
          .sort((a,b)=>b.week-a.week).slice(0,5)
          .map(item=>({week:item.week,skill:skillFor(item,row.discipline,ordinal)}));
        let suggestedValue=row.kind==='science'
          ? sugerirHabilidade(recent,options,stage)
          : 'TEXT';
        if(row.kind==='science'&&row.existingSkill){
          const existingAllowed=options.some(opt=>String(opt.value)===String(row.existingSkill));
          suggestedValue=row.hasKnowledge&&(row.hasMethod||row.evaluation==='true')
            ? '__keep'
            : (existingAllowed?row.existingSkill:'__keep');
        }
        const chosen=override!==undefined?override:suggestedValue;
        let value=chosen;
        if(row.kind==='science'&&value&&value!=='__keep'&&!options.some(opt=>String(opt.value)===String(value)))
          value=row.existingSkill?'__keep':sugerirHabilidade(recent,options,stage);
        const ability=options.find(opt=>String(opt.value)===String(value));
        const referenceHistory=recent.filter(item=>item.skill).map(item=>textoHabilidade(item.skill));
        const groupKey=row.kind==='science'
          ? (stage||'turma:'+cls.id)+'|'+week.week+'|'+disciplineKey+'|'+ordinal
          : null;
        const methodOptions=row.kind==='science' && value && value!=='__keep'
          ? opcoesMetodologia(row,ability) : [];
        const overrideMethods=quadroAtual.methodOverrides?.get(key);
        const methodologies=overrideMethods!==undefined
          ? mapearMetodologias(overrideMethods,methodOptions)
          : sugerirMetodologias(methodOptions);
        const manualGroupKey=row.kind==='manual'?disciplineKey:null;
        const manualEdited=row.kind==='manual' &&
          quadroAtual.manualTextOverrides?.has(manualGroupKey);
        const manualText=row.kind==='manual'
          ? (manualEdited?quadroAtual.manualTextOverrides.get(manualGroupKey):row.manualText)
          : '';
        const customText=quadroAtual.freeTextOverrides?.get(key);
        const freeText=String(row.existingText || (customText!==undefined?
          customText:(row.kind==='manual'?manualText:'')));
        const line={
          key,cls,week,row,value,options,methodOptions,methodologies,
          label:ability?textoHabilidade(ability):'',manual:row.kind==='manual',
          manualGroupKey,manualText,manualEdited,freeText,
          freeTextEdited:customText!==undefined,
          stage,ordinal,groupKey,
          history:referenceHistory,
          historyCount:referenceHistory.length,
          userOverride:override!==undefined
        };
        lines.push(line);
        stageLines.push(line);
        if(row.kind==='science'&&!row.existingSkill&&!options.length)
          warnings.push(cls.name+' · semana '+week.week+' · '+row.discipline+
            ' · aula '+(ordinal+1)+': '+(row.opts.length
              ? 'nenhuma habilidade compatível com a etapa selecionada; confira o ano/série.'
              : 'o SEGES não apresentou opções de habilidades no dropdown.'));
      }
      processed.push({context,form,week,lines});
    }
    // A mesma etapa, disciplina, semana e ordem da aula recebe a mesma
    // habilidade curricular, mesmo que os IDs do SEGES sejam distintos.
    const groups=new Map();
    for(const line of stageLines){
      if(!line.groupKey)continue;
      if(!groups.has(line.groupKey))groups.set(line.groupKey,[]);
      groups.get(line.groupKey).push(line);
    }
    for(const group of groups.values()){
      if(group.length<2)continue;
      const candidates=group.map(line=>({
        line,reference:referenceFor(line),
        position:line.options.findIndex(opt=>String(opt.value)===String(line.value))
      })).filter(item=>item.reference);
      if(!candidates.length)continue;
      candidates.sort((a,b)=>{
        const aCode=codigoHabilidade(a.reference.label);
        const bCode=codigoHabilidade(b.reference.label);
        return Number(b.line.userOverride)-Number(a.line.userOverride) ||
          Number(!!b.line.row.existingSkill)-Number(!!a.line.row.existingSkill) ||
          b.line.historyCount-a.line.historyCount ||
          bCode.localeCompare(aCode) ||
          b.position-a.position;
      });
      const canonical=candidates[0].reference;
      for(const line of group){
        if(line.userOverride || line.row.existingSkill)continue;
        const match=mapearHabilidade(canonical,line.options);
        if(match){
          line.value=match.value;
          line.label=textoHabilidade(match);
        }else if(!line.value && line.options.length){
          line.value=line.options[0].value;
          line.label=textoHabilidade(line.options[0]);
        }
        if(!match && warnings.length<60){
          warnings.push(line.cls.name+' · semana '+line.week.week+' · '+line.row.discipline+
            ': não há opção equivalente à habilidade das outras turmas. Manteve a sugestão própria.');
        }
      }
    }
    // Depois de alinhar as habilidades, recalcular as metodologias daquele currículo.
    for(const line of stageLines){
      if(line.manual)continue;
      const ability=line.options.find(opt=>String(opt.value)===String(line.value));
      line.methodOptions=(line.value&&line.value!=='__keep')
        ? opcoesMetodologia(line.row,ability):[];
      const override=quadroAtual.methodOverrides?.get(line.key);
      line.methodologies=override!==undefined
        ? mapearMetodologias(override,line.methodOptions)
        : sugerirMetodologias(line.methodOptions);
      if(line.value&&line.value!=='__keep'&&line.methodologies.length<2)
        warnings.push(line.cls.name+' · semana '+line.week.week+' · '+line.row.discipline+
          ' · aula '+(line.ordinal+1)+': escolha duas metodologias disponíveis antes de aprovar.');
    }
    for(const item of processed){
      const {context,form,week,lines}=item;
      const assignments=new Map();
      let newContent=false;
      for(const line of lines){
        if(line.manual){
          if(line.value==='TEXT')newContent=true;
          continue;
        }
        const opt=referenceFor(line);
        if(opt){
          assignments.set(normal(line.row.discipline)+'|'+line.ordinal,opt);
          if(line.value && line.value!=='__keep' && !line.row.existingSkill)newContent=true;
        }
      }
      if(week.existing&&temPlano(form)){
        context.timeline.set(week.week,{week:week.week,hasPlan:true,form,assignments:null});
      }else if(newContent){
        context.timeline.set(week.week,{week:week.week,hasPlan:true,form:null,assignments});
      }
    }
    suggested.push(...stageLines);
  }
  return {suggested,warnings};
}
  function mostrarPrevia() {
  const result=gerarPropostas();
  quadroAtual.review=result;
  // Até 40 aulas por página: evita criar milhares de opções de select
  // de uma só vez (comum ao marcar 30+ semanas em muitas turmas).
  const pageSize=40;
  const pages=Math.max(1,Math.ceil(result.suggested.length/pageSize));
  const currentPage=Math.max(0,Math.min(pages-1,Number(quadroAtual.previewPage)||0));
  quadroAtual.previewPage=currentPage;
  const start=currentPage*pageSize;
  const visible=result.suggested.slice(start,start+pageSize);
  const rows=visible.map(line=>{
    const {cls,week,row,value,options,history}=line;
    const skillSelector=line.manual?
      `<div style="display:flex;flex-direction:column;gap:6px;min-width:240px;max-width:340px;white-space:normal">
        <label><input type="checkbox" data-proposal-key="${html(line.key)}" ${value==='TEXT'?'checked':''}> Preencher texto padrão</label>
        <button type="button" data-edit-standard-key="${html(line.key)}">Editar texto padrão</button>
        <span style="font-size:11px;color:#587084;text-align:left;white-space:normal">
          ${line.manualEdited?'<b>Texto personalizado:</b> ':''}${html(String(line.manualText||'').slice(0,130))}${String(line.manualText||'').length>130?'…':''}
        </span>
      </div>`:
      `<select data-proposal-key="${html(line.key)}" style="min-width:250px;max-width:360px">
        <option value="" ${!value?'selected':''}>Não preencher</option>
        ${row.existingSkill?`<option value="__keep" ${value==='__keep'?'selected':''}>Preservar registro existente</option>`:''}
        ${options.map((opt,i)=>`<option value="${html(opt.value)}" ${String(opt.value)===String(value)?'selected':''}>
          ${opt.manualOnly?'⚠ ':''}${html(textoHabilidade(opt)==='Habilidade disponível no SEGES'?
            'Opção '+(i+1)+' (sem descrição)':textoHabilidade(opt))}</option>`).join('')}
       </select>`;
    const methods=line.manual?'Texto padrão':(!value||value==='__keep'?'Não alterar':
      `<div style="display:flex;flex-direction:column;gap:5px">
        ${[0,1].map(slot=>`<label style="display:flex;align-items:center;gap:5px;font-size:11px">
          <span>${slot+1}.</span><select data-method-key="${html(line.key)}" data-method-slot="${slot}"
            style="width:245px;max-width:100%;padding:5px">
            <option value="">Escolher metodologia...</option>
            ${line.methodOptions.map(name=>`<option value="${html(name)}"
              ${chaveMetodologia(line.methodologies[slot])===chaveMetodologia(name)?'selected':''}>${html(name)}</option>`).join('')}
          </select></label>`).join('')}
       </div>`);
    const freeTextEditor=`<textarea data-free-text-key="${html(line.key)}"
      rows="3" ${row.existingText?'readonly title="Texto já registrado no SEGES; preservado"':''}
      style="width:260px;min-width:210px;max-width:320px;resize:vertical;white-space:pre-wrap;font-size:12px"
      placeholder="Digite aqui o texto livre desta aula...">${html(line.freeText||'')}</textarea>
      ${row.existingText?'<div style="font-size:11px">Texto existente preservado</div>':''}`;
    return `<tr><td>${html(cls.name)}</td><td>${week.week}</td><td>${row.index+1}</td>
      <td style="text-align:left">${html(row.discipline)}${row.existingSkill?' · já preenchida':''}</td>
      <td style="text-align:left">${skillSelector}</td>
      <td style="text-align:left">${methods}</td>
      <td style="text-align:left;white-space:normal">${freeTextEditor}</td>
      <td title="${html(history.join(' → '))}" style="font-size:11px;color:#63768a">
        ${html(history.filter(Boolean).slice(0,5).join(', ')||'Sem histórico curricular')}</td></tr>`;
  }).join('');
  const root=modal(`<h3>Conferir habilidades, metodologias e textos por aula</h3>
    <p class="hint">Na coluna "Texto livre", escreva uma observação diferente para cada aula, como no campo de texto do SEGES. Os textos padrão também podem ser editados por disciplina. Nenhum plano foi gravado.</p>
    <p class="hint">As duas metodologias sugeridas são <b>Aula expositiva dialogada</b> e <b>Resolução de exercícios</b>. É possível trocar cada uma. Se você alterar uma metodologia, será perguntado se deseja replicá-la nas aulas equivalentes das outras turmas do mesmo ano.</p>
    <section id="seges-v3-text-editor" style="display:none;background:#f5f8fc;border:1px solid #cad9e6;border-radius:9px;padding:15px;margin:14px 0;white-space:normal">
      <h4 style="font-size:16px;margin:0 0 8px">Editar texto padrão — <span id="seges-v3-text-discipline"></span></h4>
      <p class="hint" id="seges-v3-text-scope"></p>
      <textarea id="seges-v3-text-input" rows="8" style="width:100%;display:block;resize:vertical;line-height:1.5;font-size:13px"></textarea>
      <p class="hint">O texto será atualizado somente nesta revisão. Aulas com texto já registrado no SEGES não serão substituídas.</p>
      <div class="actions">
        <button type="button" id="seges-v3-text-cancel">Cancelar edição</button>
        <button type="button" id="seges-v3-text-save" class="primary">Aplicar a esta disciplina</button>
      </div>
    </section>
    <p class="hint"><strong>${result.suggested.length} aula(s) para conferir.</strong> ${result.suggested.length ? 'A tabela abaixo é editável.' : 'Nenhuma aula elegível encontrada. Volte à tabela e escolha outras semanas.'}</p>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:7px 0 10px">
      <button id="seges-v3-page-prev" type="button" ${currentPage===0?'disabled':''}>Anterior</button>
      <strong id="seges-v3-page-info">Aulas ${result.suggested.length?start+1:0}–${Math.min(start+pageSize,result.suggested.length)} de ${result.suggested.length}</strong>
      <button id="seges-v3-page-next" type="button" ${currentPage>=pages-1?'disabled':''}>Próxima</button>
      <span class="hint">Página ${currentPage+1} de ${pages}. As alterações nas outras páginas também são mantidas.</span>
    </div>
    <div class="scroll"><table><thead><tr>
      <th>Turma</th><th>Semana</th><th>Aula</th><th>Disciplina</th><th>Habilidade / texto padrão</th>
      <th>Metodologias (duas)</th><th>Texto livre da aula</th><th>Últimos planos</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8" style="padding:18px">Não há aulas para revisar nas semanas selecionadas.</td></tr>'}</tbody></table></div>
    <p class="hint" id="seges-v3-warning">${result.warnings.length?html(result.warnings.join(' | ')):''}</p>
    <p id="seges-v3-message" class="hint">Confira cada habilidade e as duas metodologias. O programa não escolherá Aprendizagem Baseada em Jogos automaticamente. Se alguma opção não existir no SEGES, escolha outra ou marque a aula como Não preencher.</p>
    <div class="actions">
      <button id="seges-v3-back">Voltar à tabela</button>
      <button id="seges-v3-cancel" class="danger">Cancelar</button>
      <button id="seges-v3-approve" class="primary">Aprovar e preencher</button>
    </div>`);
  root.onclick=event=>{
    const trigger=event.target.closest('[data-edit-standard-key]');
    if(!trigger)return;
    const source=result.suggested.find(line=>line.key===trigger.dataset.editStandardKey);
    if(!source?.manual || !source.manualGroupKey)return;
    const sameDiscipline=result.suggested.filter(line=>
      line.manual && line.manualGroupKey===source.manualGroupKey);
    const enabled=sameDiscipline.filter(line=>line.value==='TEXT');
    const editor=$('#seges-v3-text-editor',root);
    const input=$('#seges-v3-text-input',root);
    const caption=$('#seges-v3-text-discipline',root);
    const scope=$('#seges-v3-text-scope',root);
    if(!editor||!input)return;
    caption.textContent=source.row.discipline;
    scope.textContent='Este texto será usado em '+sameDiscipline.length+
      ' aula(s) de '+new Set(sameDiscipline.map(line=>line.cls.id)).size+
      ' turma(s), considerando todas as semanas selecionadas. Atualmente '+enabled.length+
      ' aula(s) estão marcadas para preenchimento; as demais continuarão desmarcadas.';
    input.value=source.manualText||'';
    editor.style.display='block';
    $('#seges-v3-text-cancel',root).onclick=()=>{editor.style.display='none';};
    $('#seges-v3-text-save',root).onclick=()=>{
      const custom=String(input.value||'').trim();
      if(!custom){alert('O texto padrão não pode ficar vazio. Escreva o texto antes de aplicar.');return;}
      quadroAtual.manualTextOverrides.set(source.manualGroupKey,custom);
      const count=sameDiscipline.filter(line=>line.value==='TEXT').length;
      mostrarPrevia();
      status('Texto padrão de '+source.row.discipline+' atualizado para '+count+
        ' aula(s) marcadas. Nenhum plano foi salvo.');
    };
    editor.scrollIntoView({block:'start',behavior:'smooth'});
    input.focus();
  };
  $('#seges-v3-page-prev',root).onclick=()=>{
    if(currentPage>0){quadroAtual.previewPage=currentPage-1;mostrarPrevia();}
  };
  $('#seges-v3-page-next',root).onclick=()=>{
    if(currentPage<pages-1){quadroAtual.previewPage=currentPage+1;mostrarPrevia();}
  };
  $('#seges-v3-back',root).onclick=()=>{quadroAtual.review=null;abrirTabelaSemRecarregar();};
  $('#seges-v3-cancel',root).onclick=cancelar;
  $('#seges-v3-approve',root).disabled=result.suggested.length===0;
  $('#seges-v3-approve',root).onclick=()=>aprovarEExecutar().catch(falhar);
  root.oninput=event=>{
    const field=event.target.closest('[data-free-text-key]');
    if(!field||field.readOnly)return;
    quadroAtual.freeTextOverrides.set(field.dataset.freeTextKey,field.value);
  };
  root.onchange=event=>{
    const methodControl=event.target.closest('[data-method-key]');
    const skillControl=event.target.closest('[data-proposal-key]');
    if(!methodControl&&!skillControl)return;
    const scroll=$('.scroll',root);
    const previousTop=scroll?.scrollTop||0,previousLeft=scroll?.scrollLeft||0;
    if(methodControl){
      const key=methodControl.dataset.methodKey;
      const source=quadroAtual.review?.suggested.find(item=>item.key===key);
      if(!source)return;
      const controls=$$('[data-method-key]',root).filter(el=>el.dataset.methodKey===key);
      const desired=[0,1].map(slot=>controls.find(el=>Number(el.dataset.methodSlot)===slot)?.value||'').filter(Boolean);
      quadroAtual.methodOverrides.set(key,desired);
      const peers=(quadroAtual.review?.suggested||[]).filter(item=>
        item.key!==key && item.groupKey && item.groupKey===source.groupKey &&
        !item.row.existingSkill && item.value && item.value!=='__keep');
      if(peers.length && confirm('Aplicar também esta alteração de metodologia às '+
          peers.length+' aula(s) equivalentes das outras turmas do mesmo ano?\n\n'+
          (desired.join(' + ')||'(nenhuma metodologia)'))){
        let changed=0;
        for(const peer of peers){
          const mapping=mapearMetodologias(desired,peer.methodOptions);
          if(mapping.length===desired.length){
            quadroAtual.methodOverrides.set(peer.key,mapping);
            changed++;
          }
        }
        if(changed<peers.length)
          log('Aplicação nas turmas equivalentes: '+changed+'/'+peers.length+
            '. Algumas aulas não disponibilizaram todas as metodologias escolhidas.');
      }
    }else{
      const key=skillControl.dataset.proposalKey;
      quadroAtual.overrides.set(key,skillControl.type==='checkbox'?
        (skillControl.checked?'TEXT':''):skillControl.value);
      quadroAtual.methodOverrides.delete(key);
      const source=quadroAtual.review?.suggested.find(item=>item.key===key);
      if(source?.groupKey && skillControl.value && skillControl.value!=='__keep'){
        const selectedSkill=source.options.find(item=>String(item.value)===String(skillControl.value));
        if(selectedSkill){
          for(const peer of quadroAtual.review.suggested){
            if(peer.key===key || peer.groupKey!==source.groupKey || peer.row.existingSkill)continue;
            const equivalent=mapearHabilidade(selectedSkill,peer.options);
            if(equivalent){
              quadroAtual.overrides.set(peer.key,equivalent.value);
              quadroAtual.methodOverrides.delete(peer.key);
            }
          }
        }
      }
    }
    mostrarPrevia();
    const fresh=$('.scroll',$('#seges-v3-overlay'));
    if(fresh){fresh.scrollTop=previousTop;fresh.scrollLeft=previousLeft;}
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
  // Reconstruir a revisão com o texto que o usuário acabou de digitar.
  // Digitar no textarea não recria a tabela (evita perder o foco a cada letra).
  const refreshed=gerarPropostas();
  quadroAtual.review=refreshed;
  const proposal=refreshed.suggested;
  const actions=proposal.filter(item=>{
    const text=String(item.freeText||'').trim();
    if(item.manual)return item.value==='TEXT'&&!!text;
    return (!!item.value&&item.value!=='__keep') ||
      (!!text&&!item.row.existingText);
  });
  const replacements=actions.filter(item=>!item.manual && item.row.existingSkill && item.value!==item.row.existingSkill);
  if(!actions.length){alert('Nenhum campo foi selecionado para preencher.');return;}
  const unresolved=proposal.filter(item=>!item.manual&&!item.value&&!item.row.existingSkill&&!String(item.freeText||'').trim());
  const changedUnknown=actions.filter(item=>!item.manual && item.options.find(o=>o.value===item.value)?.manualOnly);
  const withoutTwo=actions.filter(item=>!item.manual&&item.value&&item.value!=='__keep'&&!duasMetodologiasValidas(item.methodologies));
  if(withoutTwo.length){
    const examples=withoutTwo.slice(0,5).map(item=>
      item.cls.name+' · semana '+item.week.week+' · aula '+(item.row.index+1)).join('\n');
    alert('Antes de aprovar, escolha DUAS metodologias diferentes em cada aula.\n\n'+
      withoutTwo.length+' aula(s) ainda precisam de revisão:\n'+examples+
      '\n\nCaso o SEGES não ofereça duas metodologias, marque a aula como Não preencher.');
    return;
  }
  const manualChanged=actions.filter(item=>item.manual&&item.manualEdited);
  const notesChanged=actions.filter(item=>!item.row.existingText&&String(item.freeText||'').trim()).length;
  let message='Confirmar '+actions.length+' aula(s) de '+new Set(actions.map(a=>a.cls.id)).size+
    ' turma(s), distribuídas em '+new Set(actions.map(a=>a.cls.id+':'+a.week.week)).size+' semana(s)?';
  if(unresolved.length)message+='\n\n'+unresolved.length+' aula(s) ficarão sem preencher porque você não selecionou uma habilidade.';
  if(replacements.length)message+='\n\nATENÇÃO: '+replacements.length+' habilidade(s) já registradas serão substituídas.';
  if(manualChanged.length)message+='\n\n'+manualChanged.length+' aula(s) receberão os textos padrão personalizados nesta revisão.';
  if(notesChanged)message+='\n\n'+notesChanged+' aula(s) receberão texto livre no campo do plano semanal.';
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
    const textNow=String($('textarea',actual)?.value||'').trim();
    if(textNow!==String(original.existingText||'').trim())
      throw Error('O texto livre da aula '+(original.index+1)+' mudou desde a revisão. Nenhuma gravação será feita.');
    if(!action.manual && action.value && action.value!=='__keep'){
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

  function duasMetodologiasValidas(methods){
  return Array.isArray(methods) && methods.filter(Boolean).length===2 &&
    chaveMetodologia(methods[0])!==chaveMetodologia(methods[1]);
}

  async function selecionarDuasMetodologias(block,nomes){
  if(!duasMetodologiasValidas(nomes))
    throw Error('É obrigatório aprovar duas metodologias diferentes para cada aula.');
  const select=await esperarElemento(()=>$(
    '.structured-weekly-plan-methodologies-select',block),4500);
  if(!select)throw Error('O SEGES não apresentou o campo de metodologias.');
  if(!select.multiple)
    throw Error('O campo de metodologias do SEGES não permite selecionar duas opções simultaneamente.');
  const findOptions=()=>{
    const available=Array.from(select.options||[]);
    const matched=nomes.map(name=>available.find(option=>
      String(option.value)===String(name) ||
      chaveMetodologia(option.textContent||option.value)===chaveMetodologia(name)));
    if(matched.every(Boolean) && matched[0]!==matched[1])return matched;
    return null;
  };
  const matches=await esperarElemento(findOptions,5500);
  if(!matches)throw Error('As metodologias aprovadas não foram disponibilizadas pelo SEGES: '+nomes.join(' + '));
  verificarAtivo();
  const ids=matches.map(option=>String(option.value));
  Array.from(select.options||[]).forEach(option=>{option.selected=matches.includes(option);});
  const view=select.ownerDocument.defaultView;
  select.dispatchEvent(new view.Event('input',{bubbles:true}));
  select.dispatchEvent(new view.Event('change',{bubbles:true}));
  if(view.jQuery){
    try{view.jQuery(select).val(ids).trigger('change').trigger('change.select2');}catch(_){}
  }
  await dormir(200);
  verificarAtivo();
  const actual=Array.from(select.selectedOptions||[]).map(option=>String(option.value));
  if(actual.length!==2 || !ids.every(value=>actual.includes(value)))
    throw Error('O SEGES não confirmou as duas metodologias aprovadas; o envio foi interrompido.');
}

  async function aplicarAulaNoFrame(group,action,doc) {
  verificarAtivo();
  const tr=$$('#weekly_plan tr.by-curriculum-discipline',doc)[action.row.index];
  const wantedText=String(action.freeText||'').trim();
  if(wantedText&&!action.row.existingText){
    const field=$('textarea',tr);
    if(!field)throw Error('Campo de texto livre ausente: aula '+(action.row.index+1));
    if(String(field.value||'').trim())throw Error('O campo de texto da aula já foi alterado; não sobrescrever.');
    field.value=wantedText;
    field.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));
    field.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));
  }
  if(action.manual || !action.value || action.value==='__keep')return;
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
  // A lista de metodologias foi aprovada na revisão. Não escolher a primeira
  // opção disponível nem reutilizar "Aprendizagem Baseada em Jogos" por engano.
  await selecionarDuasMetodologias(block,action.methodologies);
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
    const railsMethod=String(link.getAttribute('data-method')||'').toLowerCase();
    const turboMethod=String(link.getAttribute('data-turbo-method')||'').toLowerCase();
    if(railsMethod!=='delete'&&turboMethod!=='delete')continue;
    const url=urlSeges(link.getAttribute('href')||link.getAttribute('formaction')||'');
    if(!url||!/^\/weekly_plans\/\d+\/?$/.test(url.pathname))continue;
    // Rails UJS data-method="delete" sends POST with _method=delete.
    // Turbo data-turbo-method="delete" sends an HTTP DELETE request.
    if(railsMethod==='delete')return {url:url.href,method:'POST',
      fields:[['_method','delete']],transport:'rails-ujs',
      csrf:$('meta[name="csrf-token"]',doc)?.content||''};
    return {url:url.href,method:'DELETE',fields:[],transport:'turbo',
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
  if(!control)throw Error('Não encontrei um comando de exclusão no SEGES para a semana '+week.week+
    '. O programa não apagou este plano. Verifique se o SEGES permite excluí-lo manualmente.');
  const actual=urlSeges(control.url)?.pathname.match(/^\/weekly_plans\/(\d+)\/?$/)?.[1];
  const listed=urlSeges(week.url)?.pathname.match(/^\/weekly_plans\/(\d+)(?:\/edit)?\/?$/)?.[1];
  if(!actual||actual!==listed)throw Error('O comando de exclusão encontrado não corresponde ao ID do plano escolhido. Por segurança, nenhum comando foi enviado.');
  return control;
}

  async function executarExclusaoOficial(control){
  verificarAtivo();
  const csrf=control.csrf||$('meta[name="csrf-token"]')?.content||'';
  const fields=new URLSearchParams();
  for(const [key,value] of control.fields)fields.append(key,value);
  if(!csrf&&!fields.has('authenticity_token'))throw Error('Token de segurança do SEGES ausente.');
  const headers={'Accept':'text/html,application/xhtml+xml'};
  if(csrf)headers['X-CSRF-Token']=csrf;
  if(control.transport==='rails-ujs' && csrf && !fields.has('authenticity_token'))
    fields.set('authenticity_token',csrf);
  const options={method:control.method,credentials:'same-origin',signal:controller.signal,redirect:'follow',headers};
  if(control.method==='POST'){
    options.body=fields;
    headers['Content-Type']='application/x-www-form-urlencoded;charset=UTF-8';
  }
  const response=await fetch(control.url,options);
  verificarAtivo();
  const returned=urlSeges(response.url);
  if(!response.ok||!returned){
    let note='';
    try{
      const body=await response.text();
      const page=new DOMParser().parseFromString(body,'text/html');
      const message=$('.alert-danger,.alert-error,#error_explanation',page);
      note=String(message?.textContent||'').replace(/\s+/g,' ').trim().slice(0,240);
    }catch(_){}
    throw Error('O SEGES recusou a requisição de exclusão (HTTP '+response.status+
      (note?', mensagem: '+note:'')+'). Confirme suas permissões e o registro antes de tentar novamente.');
  }
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
      return `<tr><td><label style="display:flex;align-items:center;gap:7px;cursor:pointer">
          <input type="checkbox" data-excluir-row="${html(cls.id)}" title="Selecionar todos os planos desta turma">
          <strong>${html(cls.name)}</strong></label></td>
        ${all.map(n=>weekMap.has(n)?
          `<td><input type="checkbox" data-excluir-class="${html(cls.id)}" data-excluir-week="${n}"></td>`:
          '<td>·</td>').join('')}</tr>`;
    }).join('');
    $('#seges-v3-del-table').innerHTML=`
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0 10px">
        <button type="button" id="seges-v3-del-all">Selecionar tudo</button>
        <button type="button" id="seges-v3-del-none">Desmarcar tudo</button>
        <strong id="seges-v3-del-count">0 planos selecionados</strong>
      </div>
      <div class="scroll"><table><thead><tr>
        <th title="Marque a turma inteira">Turma</th>
        ${all.map(n=>`<th><label style="display:flex;align-items:center;justify-content:center;gap:3px;flex-direction:column;cursor:pointer">
          ${n}<input type="checkbox" data-excluir-col="${n}" title="Marcar todos os planos da semana ${n}"></label></th>`).join('')}
      </tr></thead><tbody>${rows}</tbody></table></div>
      <p class="hint">Coluna = a semana em todas as turmas; linha = todos os planos da turma. Você também pode selecionar tudo ou desmarcar tudo. Somente os planos existentes são selecionáveis.</p>`;
    const realChecks=()=>$$('[data-excluir-week]',root);
    function updateDeleteSelection(){
      const items=realChecks();
      for(const col of $$('[data-excluir-col]',root)){
        const matched=items.filter(x=>x.dataset.excluirWeek===col.dataset.excluirCol);
        const marked=matched.filter(x=>x.checked).length;
        col.checked=matched.length>0 && marked===matched.length;
        col.indeterminate=marked>0 && marked<matched.length;
        col.disabled=!matched.length;
      }
      for(const row of $$('[data-excluir-row]',root)){
        const matched=items.filter(x=>x.dataset.excluirClass===row.dataset.excluirRow);
        const marked=matched.filter(x=>x.checked).length;
        row.checked=matched.length>0 && marked===matched.length;
        row.indeterminate=marked>0 && marked<matched.length;
        row.disabled=!matched.length;
      }
      const count=items.filter(x=>x.checked).length;
      const label=$('#seges-v3-del-count',root);
      if(label)label.textContent=count+' plano(s) selecionado(s)';
      const apply=$('#seges-v3-del-apply',root);
      if(apply)apply.disabled=count===0;
    }
    $('#seges-v3-del-table',root).onchange=event=>{
      const col=event.target.closest('[data-excluir-col]');
      const row=event.target.closest('[data-excluir-row]');
      if(col)realChecks().filter(x=>x.dataset.excluirWeek===col.dataset.excluirCol)
        .forEach(x=>{x.checked=col.checked;});
      else if(row)realChecks().filter(x=>x.dataset.excluirClass===row.dataset.excluirRow)
        .forEach(x=>{x.checked=row.checked;});
      updateDeleteSelection();
    };
    $('#seges-v3-del-all',root).onclick=()=>{realChecks().forEach(x=>{x.checked=true;});updateDeleteSelection();};
    $('#seges-v3-del-none',root).onclick=()=>{realChecks().forEach(x=>{x.checked=false;});updateDeleteSelection();};
    const btn=$('#seges-v3-del-apply');
    btn.classList.add('danger');
    updateDeleteSelection();
    encerrarOperacao();
    btn.onclick=async()=>{
      const checked=$$('[data-excluir-week]:checked',root);
      if(!checked.length){alert('Marque pelo menos um plano.');return;}
      const selected=checked.map(el=>{
        const c=map.get(el.dataset.excluirClass);
        const w=c?.weeks.find(x=>x.week===Number(el.dataset.excluirWeek));
        return w?{cls:c.cls,week:w}:null;
      }).filter(Boolean);
      if(selected.length!==checked.length || !selected.length){
        alert('A seleção ficou inconsistente. Nenhum plano será excluído; reabra a tabela.');
        return;
      }
      const phrase='EXCLUIR '+selected.length;
      const answer=prompt('Você selecionou '+selected.length+' planos de '+new Set(selected.map(x=>x.cls.id)).size+
        ' turma(s).\n\nA exclusão é permanente. Digite exatamente '+phrase+' para confirmar:');
      if(answer!==phrase)return;
      iniciarOperacao();
      progresso={atual:0,total:selected.length};atualizarProgresso();
      btn.disabled=true;
      const results=[];
      let etapa='Conferência dos comandos de exclusão';
      let contexto='Nenhum plano foi enviado para exclusão';
      let ultimoMetodo='Nenhum comando foi enviado';
      try{
        // Verificar TODOS os comandos antes da primeira modificação.
        // Se qualquer plano não oferecer exclusão oficial, parar sem deletar nenhum.
        const prepared=[];
        progresso={atual:0,total:selected.length*2};atualizarProgresso();
        for(const entry of selected){
          verificarAtivo();
          contexto=entry.cls.name+' · semana '+entry.week.week;
          status('Verificando se o SEGES permite excluir: '+contexto);
          const command=await comandoExcluir(entry.week);
          prepared.push({...entry,command});
          progresso.atual++;atualizarProgresso();
        }
        etapa='Exclusão';
        log('Todos os '+prepared.length+' comandos oficiais foram localizados. Iniciando exclusões autorizadas.');
        for(const {cls,week,command} of prepared){
          verificarAtivo();
          contexto=cls.name+' · semana '+week.week;
          status('Excluindo '+contexto);
          ultimoMetodo=command.method==='POST' && command.fields?.some(field=>field[0]==='_method'&&field[1]==='delete')
            ? 'POST com _method=delete' : command.method;
          log('Comando oficial: '+ultimoMetodo+' · '+urlSeges(command.url)?.pathname);
          await executarExclusaoOficial(command);
          etapa='Confirmação do resultado';
          if(!await verificarExclusao(week,cls))
            throw Error('O SEGES respondeu, mas a lista não confirmou a remoção. Não repita sem conferir manualmente.');
          results.push(contexto);
          progresso.atual++;atualizarProgresso();
          log('Exclusão verificada: '+contexto);
          etapa='Exclusão';
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
        const reason=String(error?.message||error);
        const report=[
          diagnosticoErro(error,etapa,contexto),
          'Último método enviado: '+ultimoMetodo,
          'Exclusões verificadas: '+results.length,
          ...results.map(value=>'CONFIRMADO: '+value)
        ].join('\n');
        status('Exclusão interrompida em '+etapa+': '+reason);
        log('Falha no plano: '+contexto);
        encerrarOperacao();
        modal(`<h3>Exclusão interrompida — ${html(etapa)}</h3>
          <p style="color:#a52b32;font-weight:bold">${html(reason)}</p>
          <p><b>Plano:</b> ${html(contexto)}.</p>
          <p><b>Exclusões confirmadas:</b> ${results.length}.
          ${etapa==='Conferência dos comandos de exclusão'?'Nenhum comando de exclusão foi enviado nesta tentativa.':
            'Algumas exclusões podem já ter ocorrido. Confira o SEGES antes de tentar novamente.'}</p>
          <p class="hint">Use "Copiar diagnóstico" para compartilhar a causa do erro sem precisar procurar no console. Não compartilhe tokens nem informações pessoais da página.</p>
          <div class="actions">
            <button type="button" id="seges-v3-copy-error">Copiar diagnóstico</button>
            <button type="button" id="seges-v3-save-error">Baixar diagnóstico TXT</button>
            <button type="button" id="seges-v3-done">Fechar</button>
          </div>`);
        $('#seges-v3-copy-error').onclick=async()=>{
          try{await navigator.clipboard.writeText(report);alert('Diagnóstico copiado.');}
          catch(_){baixar('seges-erro-exclusao.txt',report);alert('Seu navegador bloqueou a cópia; o diagnóstico foi baixado em TXT.');}
        };
        $('#seges-v3-save-error').onclick=()=>baixar('seges-erro-exclusao.txt',report);
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
