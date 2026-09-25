import { initProjectDetails, PLOT, ipaAt } from '../project-details.js?v=20260924f';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const content = $('#pg-content'), sidebar = $('.pg-sidebar');
let field = 'neural', mode = 'browse', selected = 0;
const groups = [];
try {
  const response = await fetch('../index.html', { cache:'no-cache' });
  if (!response.ok) throw new Error('Portfolio could not be loaded.');
  const source = new DOMParser().parseFromString(await response.text(), 'text/html');
  content.replaceChildren();
  $$('.experience-sequence', source).forEach((original, index) => {
    const chapter = original.closest('[data-chapter]').dataset.chapter;
    const group = document.createElement('section'); group.className = 'pg-group';
    const header = document.createElement('header'); header.className = 'pg-role';
    const originalHeader = $('.role-heading', original);
    [...originalHeader.children].filter(node => !node.matches('.kicker')).forEach(node => header.append(node.cloneNode(true)));
    group.append(header);
    const tabs = document.createElement('div'); tabs.className = 'pg-project-tabs'; tabs.setAttribute('role','tablist'); tabs.setAttribute('aria-label', $('h2',header).textContent+' projects'); group.append(tabs);
    const projects = [];
    $$('.step',original).forEach((step,i) => {
      const entry = $('.entry',step).cloneNode(true);
      $$('[href],[src]',entry).forEach(node => ['href','src'].forEach(attr => {
        const value = node.getAttribute(attr);
        if(value && !value.startsWith('#')) node.setAttribute(attr,new URL(value,new URL('../index.html',location.href)).href);
      }));
      const project = document.createElement('section'); project.className = 'pg-project'; project.id = 'pg-'+step.id;
      project.setAttribute('role','tabpanel'); project.setAttribute('aria-labelledby','pg-tab-'+step.id); project.append(entry);
      const link = document.createElement('a'); link.className='pg-scene'; link.href='../index.html#'+step.id; link.textContent='View this project in the animated story ↗'; entry.append(link);
      const tab = document.createElement('button'); tab.type='button'; tab.id='pg-tab-'+step.id; tab.setAttribute('role','tab'); tab.setAttribute('aria-controls',project.id);
      const heading = $('.project',entry).cloneNode(true); $('.project-index',heading)?.remove(); tab.textContent=heading.textContent.trim();
      tabs.append(tab); group.append(project); projects.push({tab,project});
      tab.addEventListener('click',()=>{record.project=i;render();});
      tab.addEventListener('keydown',event=>{
        let next = event.key==='ArrowRight' ? (i+1)%projects.length : event.key==='ArrowLeft' ? (i+projects.length-1)%projects.length : event.key==='Home' ? 0 : event.key==='End' ? projects.length-1 : null;
        if(next!==null){event.preventDefault();record.project=next;render();projects[next].tab.focus();}
      });
    });
    const button = document.createElement('button'); button.type='button'; button.append(document.createTextNode($('h2',header).textContent)); const count=document.createElement('small'); count.textContent=String(projects.length).padStart(2,'0'); button.append(count); sidebar.append(button);
    const record={chapter,group,button,tabs,projects,project:0}; groups.push(record); content.append(group);
    button.addEventListener('click',()=>{selected=index;render();if(mode==='read')group.scrollIntoView({block:'start',behavior:'smooth'});});
  });
  document.body.append($('#demo',source).cloneNode(true));
  initProjectDetails();
  $$('.sub small').forEach(note => { if(note.textContent.includes('cluster on the left')) note.textContent='Select a topic to read the implementation details'; });
  const plotCaption=$('.ipa-fig .fig-cap > span');
  if(plotCaption) plotCaption.textContent='Measured: single-layer perceptron on MNIST. Use the slider to prune.';
  // The home-page scroll demonstration becomes a slider in this compact view.
  const plot = $('#ipa-plot');
  if(plot){
    const label=document.createElement('label');label.className='pg-pruning';label.textContent='Prune the network';
    const range=document.createElement('input');range.type='range';range.min='0';range.max='98';range.value='0';label.append(range);$('.ipa-fig').after(label);
    range.addEventListener('input',()=>{const q=Number(range.value)/100,x=(PLOT.x0+(PLOT.x1-PLOT.x0)*q)*100;$('#ipa-marker').style.left=x+'%';$('#ipa-dot').style.left=x+'%';$('#ipa-dot').style.top=ipaAt(q)*100+'%';$('#ipa-read').textContent=range.value+'% pruned';});
  }
  await import('../app.js?v=20260924f');
  $$('.pg-fields button').forEach(button=>button.addEventListener('click',()=>{field=button.dataset.field;selected=groups.findIndex(g=>g.chapter===field);render();}));
  $$('.pg-modes button').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.mode;render();}));
  render();
} catch(error) {
  content.textContent='The playground could not load the portfolio. Return to the homepage and try again.';
  console.error(error);
}
function render(){
  document.body.dataset.field=field;content.classList.toggle('read',mode==='read');
  $$('.pg-fields button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.field===field)));
  $$('.pg-modes button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  groups.forEach((g,index)=>{
    g.button.hidden=g.chapter!==field;g.button.setAttribute('aria-pressed',String(index===selected));
    g.group.hidden=g.chapter!==field||(mode==='browse'&&index!==selected);g.tabs.hidden=mode==='read';
    g.projects.forEach((p,i)=>{const on=i===g.project;p.project.hidden=mode==='browse'&&!on;p.tab.setAttribute('aria-selected',String(on));p.tab.tabIndex=on?0:-1;});
  });
}
