const STORAGE_KEY = 'meu-financeiro-v1';
const SUPABASE_URL = 'https://vztpxxpznubequvsapwv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WROxoK_Ow9iWAjA-OJDOnA_sEjX0Vfb';
const cloud = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentUser = null, currentProfile = null, adminUsers = [], saveTimer = null, authMode = 'login';
const MONTHS = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const CATEGORIES = {
  despesa: ['Moradia','Alimentação','Transporte','Saúde','Educação','Lazer','Compras','Outros'],
  receita: ['Salário','Renda extra','Benefícios','Vendas','Reembolso','Outros'],
  investimento: ['Aporte','Retirada']
};
const ICONS = {Moradia:'⌂',Alimentação:'◌',Transporte:'↗',Saúde:'＋',Educação:'▤',Lazer:'✳',Contas:'▣',Compras:'◇',Outros:'•',Salário:'↙','Renda extra':'✳',Benefícios:'◇',Vendas:'↗',Reembolso:'↩',Aporte:'↘',Retirada:'↗'};
const today = new Date();
let state = emptyState();
const newestTransaction = [...state.transactions].sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
let monthCursor = newestTransaction?.date ? new Date(dateObj(newestTransaction.date).getFullYear(),dateObj(newestTransaction.date).getMonth(),1) : new Date(today.getFullYear(), today.getMonth(), 1);
let activeView = 'inicio';
let activeKind = 'despesa';
let activeFilter = 'todos';
let reportFilter = 'todos';
let installPrompt = null;
let toastTimer;

function emptyState(){return {transactions:[],goals:[],categories:{},budgets:[],cards:[]};}
function accountStorageKey(user=currentUser){return user?`${STORAGE_KEY}:${user.id}`:STORAGE_KEY;}
function readState(key=accountStorageKey()){
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}');
    return {transactions:Array.isArray(parsed.transactions)?parsed.transactions.map(t=>({...t,paid:typeof t.paid==='boolean'?t.paid:true})):[], goals:Array.isArray(parsed.goals)?parsed.goals:[], categories:parsed.categories&&typeof parsed.categories==='object'?parsed.categories:{}, budgets:Array.isArray(parsed.budgets)?parsed.budgets:[], cards:Array.isArray(parsed.cards)?parsed.cards:[]};
  } catch { return {transactions:[], goals:[], categories:{}, budgets:[], cards:[]}; }
}
function saveState(){ localStorage.setItem(accountStorageKey(), JSON.stringify(state)); renderAll(); if(currentUser){clearTimeout(saveTimer);saveTimer=setTimeout(()=>syncState().catch(showCloudError),500);} }
function showCloudError(error){console.error(error);showToast(`Não foi possível sincronizar: ${error.message||'verifique a conexão'}`);}
async function replaceRows(table, rows){const del=await cloud.from(table).delete().eq('user_id',currentUser.id);if(del.error)throw del.error;for(let i=0;i<rows.length;i+=500){const part=rows.slice(i,i+500);if(part.length){const result=await cloud.from(table).insert(part);if(result.error)throw result.error;}}}
async function syncState(){if(!currentUser)return;const uid=currentUser.id;
  for(const t of state.transactions){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t.id))t.id=crypto.randomUUID();}
  for(const g of state.goals){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(g.id))g.id=crypto.randomUUID();}
  const cardIds=new Map(state.cards.map(c=>[c.name,crypto.randomUUID()]));
  const categoryRows=Object.entries(state.categories).flatMap(([kind,names])=>(Array.isArray(names)?names:[]).map((name,i)=>({user_id:uid,kind,name,sort_order:i})));
  const txRows=state.transactions.map(t=>({id:t.id,user_id:uid,kind:t.kind,description:t.description,amount:t.amount,category_name:t.category,occurred_on:t.date,due_on:t.dueDate||t.date,paid_on:t.paymentDate||null,is_paid:t.paid!==false,payment_method:t.method||null,card_name:t.card||null,installment:t.installment||null,note:t.note||null}));
  const goalRows=state.goals.map(g=>({id:g.id,user_id:uid,name:g.name,target_amount:g.target,saved_amount:g.saved||0}));
  const budgetRows=state.budgets.flatMap(b=>(Array.isArray(b.monthly)?b.monthly:[]).map((amount,i)=>Number(amount)>0?{user_id:uid,kind:b.kind,category_name:b.category,budget_year:today.getFullYear(),budget_month:i+1,planned_amount:Number(amount)}:null).filter(Boolean));
  const cardRows=state.cards.map(c=>({id:cardIds.get(c.name),user_id:uid,name:c.name}));
  const cardBudgetRows=state.cards.flatMap(c=>(Array.isArray(c.monthly)?c.monthly:[]).map((amount,i)=>Number(amount)>0?{user_id:uid,card_id:cardIds.get(c.name),budget_year:today.getFullYear(),budget_month:i+1,planned_amount:Number(amount)}:null).filter(Boolean));
  await replaceRows('transactions',txRows);await replaceRows('goals',goalRows);await replaceRows('categories',categoryRows);await replaceRows('monthly_budgets',budgetRows);await replaceRows('card_monthly_budgets',cardBudgetRows);await replaceRows('cards',cardRows);
  localStorage.setItem(accountStorageKey(),JSON.stringify(state));
}
async function loadCloudState(){const uid=currentUser.id;const tables=['transactions','goals','categories','monthly_budgets','cards','card_monthly_budgets'];const result=await Promise.all(tables.map(table=>cloud.from(table).select('*').eq('user_id',uid)));for(const r of result)if(r.error)throw r.error;
  const [tx,goals,cats,budgets,cards,cardBudgets]=result.map(r=>r.data);
  if(!tx.length&&!goals.length&&!cats.length&&!budgets.length&&!cards.length){await syncState();return;}
  state.transactions=tx.map(t=>({id:t.id,kind:t.kind,description:t.description,amount:Number(t.amount),category:t.category_name,date:t.occurred_on,dueDate:t.due_on,paymentDate:t.paid_on,paid:t.is_paid,status:t.is_paid?'paid':'pending',method:t.payment_method||'',card:t.card_name||'',installment:t.installment||'',note:t.note||'',createdAt:Date.parse(t.created_at)||Date.now()}));
  state.goals=goals.map(g=>({id:g.id,name:g.name,target:Number(g.target_amount),saved:Number(g.saved_amount)}));state.categories={};cats.forEach(c=>(state.categories[c.kind]??=[]).push(c.name));
  const budgetsByKey=new Map();budgets.forEach(b=>{const key=`${b.kind}|${b.category_name}`;if(!budgetsByKey.has(key))budgetsByKey.set(key,{kind:b.kind,category:b.category_name,monthly:Array(12).fill(0)});budgetsByKey.get(key).monthly[b.budget_month-1]=Number(b.planned_amount);});state.budgets=[...budgetsByKey.values()];
  const cardById=new Map(cards.map(c=>[c.id,{name:c.name,monthly:Array(12).fill(0)}]));cardBudgets.forEach(b=>{const c=cardById.get(b.card_id);if(c)c.monthly[b.budget_month-1]=Number(b.planned_amount);});state.cards=[...cardById.values()];
  localStorage.setItem(accountStorageKey(),JSON.stringify(state));renderAll();
}
async function loadAdminStatus(){const {data,error}=await cloud.from('profiles').select('role,plan_key,subscription_status').eq('user_id',currentUser.id).single();if(error)throw error;currentProfile=data;const isAdmin=data.role==='admin';document.getElementById('admin-nav').classList.toggle('hidden',!isAdmin);document.querySelector('.bottom-nav').classList.toggle('admin-mode',isAdmin);if(isAdmin)await loadAdminUsers();}
async function loadAdminUsers(){if(currentProfile?.role!=='admin')return;document.getElementById('admin-users').innerHTML='<p class="muted-note">Carregando contas…</p>';const {data,error}=await cloud.from('profiles').select('user_id,email,display_name,role,plan_key,subscription_status,created_at').order('created_at',{ascending:false});if(error)throw error;adminUsers=data||[];renderAdminUsers();}
function renderAdminUsers(){const term=document.getElementById('admin-search').value.trim().toLowerCase();const users=adminUsers.filter(u=>`${u.email} ${u.display_name}`.toLowerCase().includes(term));document.getElementById('admin-total').textContent=adminUsers.length;document.getElementById('admin-active').textContent=adminUsers.filter(u=>['active','trial'].includes(u.subscription_status)).length;document.getElementById('admin-suspended').textContent=adminUsers.filter(u=>u.subscription_status==='suspended').length;const root=document.getElementById('admin-users');root.innerHTML=users.length?users.map(u=>{const locked=u.role==='admin'||u.user_id===currentUser?.id;const statuses=['active','trial','past_due','canceled','suspended'];const plans=['free','premium','owner'];const date=u.created_at?new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium'}).format(new Date(u.created_at)):'—';return `<article class="admin-user-card" data-user-card="${escapeHtml(u.user_id)}"><div class="admin-user-heading"><div class="admin-user-avatar">${escapeHtml((u.display_name||u.email||'?').slice(0,1).toUpperCase())}</div><div class="admin-user-identity"><strong>${escapeHtml(u.display_name||'Sem nome')}</strong><span>${escapeHtml(u.email)}</span></div><span class="admin-role ${u.role==='admin'?'admin-role-owner':''}">${u.role==='admin'?'ADMIN':'CLIENTE'}</span></div><div class="admin-user-meta"><span>Cadastro ${date}</span><span class="admin-status status-${escapeHtml(u.subscription_status)}">${escapeHtml(u.subscription_status)}</span></div><div class="admin-controls"><label>Plano<select class="text-input" data-admin-plan ${locked?'disabled':''}>${plans.map(p=>`<option value="${p}" ${u.plan_key===p?'selected':''}>${p}</option>`).join('')}</select></label><label>Acesso<select class="text-input" data-admin-status ${locked?'disabled':''}>${statuses.map(s=>`<option value="${s}" ${u.subscription_status===s?'selected':''}>${s}</option>`).join('')}</select></label></div>${locked?'<p class="admin-lock-note">Contas de administrador são protegidas.</p>':`<button type="button" class="secondary-button admin-save" data-admin-save="${escapeHtml(u.user_id)}">Salvar alterações</button>`}</article>`;}).join(''):'<p class="muted-note">Nenhuma conta encontrada.</p>';}
async function handleSession(session){currentUser=session?.user||null;state=currentUser?readState(accountStorageKey(currentUser)):emptyState();currentProfile=null;adminUsers=[];renderAll();const button=document.getElementById('account-button');button.textContent=currentUser?(currentUser.email.split('@')[0]||'Conta'):'Entrar';const dialog=document.getElementById('auth-dialog');document.getElementById('admin-nav').classList.add('hidden');document.querySelector('.bottom-nav').classList.remove('admin-mode');if(!currentUser){if(!dialog.open)dialog.showModal();return;}try{await loadCloudState();await loadAdminStatus();if(dialog.open)dialog.close();renderAll();showToast('Dados sincronizados com a nuvem.');}catch(error){showCloudError(error);}}
function money(value){ return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value || 0); }
function dateObj(value){ const [y,m,d]=String(value).split('-').map(Number); return new Date(y,m-1,d); }
function dateLabel(value){ return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(dateObj(value)).replace('.',''); }
function sameMonth(date){ const d=dateObj(date); return d.getMonth()===monthCursor.getMonth()&&d.getFullYear()===monthCursor.getFullYear(); }
function monthTransactions(){ return state.transactions.filter(t=>sameMonth(t.date)); }
function sorted(items){ return [...items].sort((a,b)=>String(b.date).localeCompare(String(a.date)) || b.createdAt-a.createdAt); }
function escapeHtml(value){ return String(value??'').replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function monthText(date=monthCursor){ return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`; }
function setMonthLabels(){ document.querySelectorAll('#month-label,#list-month-label,#budget-month-label,#report-month-label').forEach(el=>el.textContent=monthText()); }
function sums(items){ return items.reduce((a,t)=>{if(t.kind==='receita')a.income+=t.amount;else if(t.kind==='despesa')a.expense+=t.amount;return a;},{income:0,expense:0}); }
function transactionIcon(t){ return ICONS[t.category] || (t.kind==='receita'?'↙':t.kind==='investimento'?'↗':'•'); }
function signedClass(t){return t.kind==='receita'?'income':t.kind==='investimento'?'investment':'expense';}
function signedAmount(t){ if(t.kind==='receita') return `+ ${money(t.amount)}`; if(t.kind==='investimento') return `${t.category==='Retirada'?'+':'−'} ${money(t.amount)}`; return `− ${money(t.amount)}`; }
function txMarkup(t, deletable=true){
  const label=t.kind==='investimento'?`Investimento · ${t.category}`:t.category;
  const detail=[label,dateLabel(t.date),t.method,t.card,t.installment?`Parcela ${t.installment}`:'',t.note].filter(Boolean).map(escapeHtml).join(' · ');
  const status=t.kind==='investimento'?'':`<span class="status-tag ${t.paid?'is-paid':'is-pending'}">${t.paid?'Realizado':'Pendente'}</span>`;
  return `<article class="transaction-row"><span class="transaction-icon">${escapeHtml(transactionIcon(t))}</span><div><div class="transaction-title">${escapeHtml(t.description)}</div><div class="transaction-meta">${detail}</div>${status}</div><div class="transaction-amount ${signedClass(t)}">${signedAmount(t)}${deletable&&!t.paid&&t.kind!=='investimento'?`<button class="row-pay" data-set-paid="${escapeHtml(t.id)}" aria-label="Marcar ${escapeHtml(t.description)} como realizado" title="Marcar realizado">✓</button>`:''}${deletable?`<button class="row-delete" data-delete-transaction="${escapeHtml(t.id)}" aria-label="Apagar ${escapeHtml(t.description)}" title="Apagar lançamento">×</button>`:''}</div></article>`;
}
function renderDashboard(){
  const items=monthTransactions(), realized=sums(items.filter(t=>t.paid||t.kind==='investimento')), planned=sums(items), balance=realized.income-realized.expense;
  document.getElementById('balance-value').textContent=money(balance);
  document.getElementById('balance-value').classList.toggle('negative',balance<0);
  document.getElementById('balance-caption').textContent=balance<0?'Saídas realizadas acima das entradas':'Entradas menos saídas pagas';
  document.getElementById('income-value').textContent=money(realized.income);
  document.getElementById('expense-value').textContent=money(realized.expense);
  document.getElementById('income-plan').textContent=`Planejado ${money(planned.income)}`;
  document.getElementById('expense-plan').textContent=`Planejado ${money(planned.expense)}`;
  const expenseItems=items.filter(t=>t.kind==='despesa'&&t.paid);
  const byCategory=Object.entries(expenseItems.reduce((acc,t)=>{acc[t.category]=(acc[t.category]||0)+t.amount;return acc;},{})).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const categoryBox=document.getElementById('category-summary');
  if(!byCategory.length){categoryBox.innerHTML='<p class="muted-note">Suas despesas por categoria aparecem aqui.</p>';}
  else {const max=byCategory[0][1]||1;categoryBox.innerHTML=byCategory.map(([name,value])=>`<div class="category-row"><span class="category-icon">${escapeHtml(ICONS[name]||'•')}</span><span class="category-name">${escapeHtml(name)}</span><strong class="category-value">${money(value)}</strong><div class="category-track"><span style="width:${Math.max(5,value/max*100)}%"></span></div></div>`).join('');}
  const recent=sorted(items).slice(0,4);
  document.getElementById('recent-list').innerHTML=recent.map(t=>txMarkup(t)).join('');
  document.getElementById('recent-empty').classList.toggle('hidden',recent.length>0);
}
function renderTransactions(){
  const items=monthTransactions(), totals=sums(items.filter(t=>t.paid)), planned=sums(items);
  document.getElementById('list-income').textContent=money(totals.income);
  document.getElementById('list-expense').textContent=money(totals.expense);
  document.getElementById('list-income-plan').textContent=`Planejado ${money(planned.income)}`;
  document.getElementById('list-expense-plan').textContent=`Planejado ${money(planned.expense)}`;
  const visible=sorted(items).filter(t=>activeFilter==='todos'||t.kind===activeFilter);
  document.getElementById('full-list').innerHTML=visible.map(t=>txMarkup(t)).join('');
  document.getElementById('list-empty').classList.toggle('hidden',visible.length>0);
}
function renderGoals(){
  const root=document.getElementById('goal-list');
  root.innerHTML=state.goals.map(g=>{
    const pct=Math.min(100,Math.round((g.saved/g.target)*100));
    return `<article class="goal-card"><div class="goal-card-top"><span class="goal-icon">◇</span><strong class="goal-name">${escapeHtml(g.name)}</strong><button class="goal-more" data-goal-add="${escapeHtml(g.id)}" aria-label="Adicionar valor à meta ${escapeHtml(g.name)}" title="Adicionar valor">＋</button><button class="goal-more delete-action" data-goal-delete="${escapeHtml(g.id)}" aria-label="Apagar meta ${escapeHtml(g.name)}" title="Apagar meta">×</button></div><div class="goal-money"><strong>${money(g.saved)} <span>de ${money(g.target)}</span></strong><span>${pct}%</span></div><div class="goal-progress"><span style="width:${pct}%"></span></div><div class="goal-foot"><span>Faltam ${money(Math.max(0,g.target-g.saved))}</span><b>${pct>=100?'Meta alcançada':'Em andamento'}</b></div></article>`;
  }).join('');
  document.getElementById('goal-empty').classList.toggle('hidden',state.goals.length>0);
}
function renderBudgets(){
  const month=monthCursor.getMonth();
  const plans=state.budgets.filter(b=>Array.isArray(b.monthly)&&Number(b.monthly[month])>0);
  const rows=plans.map(b=>{
    const actual=monthTransactions().filter(t=>t.kind===b.kind&&t.category===b.category&&t.paid).reduce((sum,t)=>sum+t.amount,0);
    const planned=Number(b.monthly[month])||0,pct=Math.min(100,Math.round(actual/planned*100));
    const icon=ICONS[b.category]||'•';
    return `<article class="budget-row"><span class="category-icon">${escapeHtml(icon)}</span><div class="budget-main"><div class="budget-heading"><strong>${escapeHtml(b.category)}</strong><span>${money(planned)}</span></div><div class="goal-progress"><span style="width:${Math.max(3,pct)}%"></span></div><div class="budget-foot"><span>${b.kind==='receita'?'Recebido':'Realizado'} ${money(actual)}</span><b>${pct}%</b></div></div></article>`;
  });
  const budgetRoot=document.getElementById('budget-list');budgetRoot.innerHTML=rows.join('');
  document.getElementById('budget-empty').classList.toggle('hidden',rows.length>0);
  const cards=state.cards.map(card=>{
    const expected=Number(card.monthly?.[month])||0;
    const actual=monthTransactions().filter(t=>t.kind==='despesa'&&t.paid&&t.card===card.name).reduce((sum,t)=>sum+t.amount,0);
    return `<article class="card-budget-row"><span class="card-chip">▣</span><div><strong>${escapeHtml(card.name)}</strong><small>Realizado ${money(actual)}</small></div><b>${money(expected)}</b></article>`;
  });
  document.getElementById('card-budget-list').innerHTML=cards.length?cards.join(''):'<p class="muted-note">Nenhum cartão cadastrado na planilha.</p>';
}
function renderInvestments(){
  const all=state.transactions.filter(t=>t.kind==='investimento');
  const total=all.reduce((n,t)=>n+(t.category==='Retirada'?-t.amount:t.amount),0);
  document.getElementById('invested-value').textContent=money(total);
  const recent=sorted(all);
  document.getElementById('investment-list').innerHTML=recent.map(t=>txMarkup(t)).join('');
  document.getElementById('investment-empty').classList.toggle('hidden',recent.length>0);
}
function reportTotals(kind){
  const monthIndex=monthCursor.getMonth();
  const plans=state.budgets.filter(b=>b.kind===kind&&Array.isArray(b.monthly));
  const actuals=monthTransactions().filter(t=>t.kind===kind&&t.paid!==false);
  const pending=monthTransactions().filter(t=>t.kind===kind&&t.paid===false);
  const actual=actuals.reduce((sum,t)=>sum+(Number(t.amount)||0),0);
  const categoryNames=new Set([...plans.map(b=>b.category),...monthTransactions().filter(t=>t.kind===kind).map(t=>t.category)]);
  const categories=[...categoryNames].filter(Boolean).map(name=>{
    const categoryBudget=plans.filter(b=>b.category===name).reduce((sum,b)=>sum+(Number(b.monthly[monthIndex])||0),0);
    const pendingAmount=pending.filter(t=>t.category===name).reduce((sum,t)=>sum+(Number(t.amount)||0),0);
    const categoryPlan=categoryBudget||pendingAmount;
    const categoryActual=actuals.filter(t=>t.category===name).reduce((sum,t)=>sum+(Number(t.amount)||0),0);
    return {name,planned:categoryPlan,actual:categoryActual,pct:categoryPlan?Math.round(categoryActual/categoryPlan*100):null};
  }).sort((a,b)=>b.actual-a.actual||b.planned-a.planned||a.name.localeCompare(b.name,'pt-BR'));
  const planned=categories.reduce((sum,category)=>sum+category.planned,0);
  return {planned,actual,categories};
}
function reportSummaryMarkup(kind,title,icon){
  const data=reportTotals(kind),pct=data.planned?Math.round(data.actual/data.planned*100):0;
  const fill=Math.min(100,pct),over=data.planned>0&&data.actual>data.planned;
  const className=kind==='receita'?'income':'expense';
  const ratio=data.planned?`${pct}%`:'—';
  const caption=data.planned?`${pct}% do plano`: 'Sem planejamento';
  return `<article class="report-summary-card ${className}"><div class="report-summary-main"><div class="report-summary-copy"><span class="report-kind-icon">${icon}</span><div><p>${title}</p><strong>${money(data.actual)}</strong></div></div><div class="report-ring" style="--ring-fill:${fill*3.6}deg" role="img" aria-label="${title}: ${caption}"><span>${ratio}</span></div></div><div class="report-summary-bottom"><span>Planejado ${money(data.planned)}</span><span class="report-delta ${over?'over':''}">${data.planned?`${over?'Acima':'Saldo'} ${money(Math.abs(data.planned-data.actual))}`:'Sem plano'}</span></div><div class="report-progress" role="progressbar" aria-label="${title}: ${caption}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100,pct)}"><span style="width:${fill}%"></span></div><small>${caption}</small></article>`;
}
function renderReports(){
  const kinds=reportFilter==='todos'?['receita','despesa']:[reportFilter];
  document.querySelectorAll('[data-report-filter]').forEach(button=>button.classList.toggle('active',button.dataset.reportFilter===reportFilter));
  document.getElementById('report-overview').innerHTML=kinds.map(kind=>reportSummaryMarkup(kind,kind==='receita'?'Recebimentos':'Despesas',kind==='receita'?'↙':'↗')).join('');
  const categoryRoot=document.getElementById('report-categories');
  categoryRoot.innerHTML=kinds.map(kind=>{
    const data=reportTotals(kind);
    const title=kind==='receita'?'Recebimentos':'Despesas';
    if(!data.categories.length)return `<section class="report-category-section"><div class="section-heading"><div><p class="eyebrow">${kind==='receita'?'ENTRADAS':'SAÍDAS'}</p><h2>${title} por categoria</h2></div></div><p class="muted-note report-note">Ainda não há lançamentos nem valores planejados neste período.</p></section>`;
    const rows=data.categories.map(category=>{
      const pct=category.pct===null?0:Math.min(100,category.pct);
      const pctLabel=category.pct===null?'Sem plano':`${category.pct}%`;
      const remaining=category.pct===null?'Sem planejamento':category.actual>category.planned?`Acima ${money(category.actual-category.planned)}`:`Restam ${money(category.planned-category.actual)}`;
      return `<article class="report-category-card ${kind}"><div class="report-category-top"><span class="category-icon">${escapeHtml(ICONS[category.name]||'•')}</span><strong>${escapeHtml(category.name)}</strong><b>${pctLabel}</b></div><div class="report-category-values"><span>Planejou <strong>${money(category.planned)}</strong></span><span>${kind==='receita'?'Recebeu':'Gastou'} <strong>${money(category.actual)}</strong></span></div><div class="report-progress" role="progressbar" aria-label="${escapeHtml(category.name)}: ${pctLabel}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div><small>${remaining}</small></article>`;
    }).join('');
    return `<section class="report-category-section"><div class="section-heading"><div><p class="eyebrow">${kind==='receita'?'ENTRADAS':'SAÍDAS'}</p><h2>${title} por categoria</h2></div></div><div class="report-category-list">${rows}</div></section>`;
  }).join('');
  const items=sorted(monthTransactions().filter(t=>kinds.includes(t.kind)));
  document.getElementById('report-transactions').innerHTML=items.map(t=>txMarkup(t,false)).join('');
  document.getElementById('report-empty').classList.toggle('hidden',items.length>0);
}
function exportReportCsv(){
  const kinds=reportFilter==='todos'?['receita','despesa']:[reportFilter];
  const quote=value=>`"${String(value??'').replace(/"/g,'""')}"`;
  const rows=[['Mês','Tipo','Categoria','Planejado (R$)','Realizado (R$)','Percentual']];
  for(const kind of kinds){
    const data=reportTotals(kind);
    for(const category of data.categories)rows.push([monthText(),kind==='receita'?'Receita':'Despesa',category.name,(category.planned||0).toFixed(2).replace('.',','),(category.actual||0).toFixed(2).replace('.',','),category.pct===null?'Sem plano':`${category.pct}%`]);
  }
  if(rows.length===1){showToast('Não há dados de receitas ou despesas para exportar.');return;}
  const csv='\uFEFF'+rows.map(row=>row.map(quote).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`relatorio-${monthCursor.getFullYear()}-${String(monthCursor.getMonth()+1).padStart(2,'0')}.csv`;link.click();URL.revokeObjectURL(url);
}
function exportReportPdf(){
  document.getElementById('print-report-month').textContent=monthText();
  document.getElementById('print-report-date').textContent=new Intl.DateTimeFormat('pt-BR',{dateStyle:'long'}).format(new Date());
  const previousTitle=document.title;
  document.title=`Relatório financeiro - ${monthText()}`;
  window.addEventListener('afterprint',()=>{document.title=previousTitle;},{once:true});
  window.print();
}
function renderAll(){setMonthLabels();renderDashboard();renderTransactions();renderGoals();renderBudgets();renderInvestments();renderReports();}
function switchView(view){
  activeView=view;
  document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id===`view-${view}`));
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.nav===view));
  document.querySelector('.floating-add').classList.toggle('hidden',!['inicio','lancamentos'].includes(view));
  window.scrollTo({top:0,behavior:'smooth'});
}
function showToast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600);}
function fillCategories(){
  const select=document.getElementById('tx-category');
  const extras=Array.isArray(state.categories[activeKind])?state.categories[activeKind]:[];
  const canManageCategories=true;
  const options=[...CATEGORIES[activeKind],...extras];
  select.innerHTML=options.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')+(canManageCategories?'<option value="__new">＋ Criar categoria</option>':'');
  select.onchange=()=>{if(canManageCategories&&select.value==='__new'){const category=prompt('Nome da nova categoria:');if(category?.trim()){state.categories[activeKind]=[...(state.categories[activeKind]||[]),category.trim()];const wanted=category.trim();fillCategories();select.value=wanted;localStorage.setItem(accountStorageKey(),JSON.stringify(state));}else select.selectedIndex=0;}};
}
function openTransaction(kind='despesa'){
  activeKind=kind;
  document.querySelectorAll('.type-option').forEach(b=>b.classList.toggle('active',b.dataset.kind===kind));
  fillCategories();
  document.getElementById('transaction-form').reset();
  document.getElementById('tx-date').value=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  document.getElementById('tx-status').value='paid';
  document.getElementById('transaction-dialog-title').textContent=kind==='investimento'?'Movimentação de investimento':'Novo lançamento';
  document.querySelector('#transaction-form .submit-button').textContent=kind==='investimento'?'Salvar movimentação':'Salvar lançamento';
  document.getElementById('transaction-dialog').showModal();
}
function addTransaction(event){
  event.preventDefault();
  const description=document.getElementById('tx-description').value.trim();
  const amount=Number(document.getElementById('tx-amount').value);
  if(!description||!Number.isFinite(amount)||amount<=0)return;
  const category=document.getElementById('tx-category').value;
  const date=document.getElementById('tx-date').value,paid=activeKind==='investimento'||document.getElementById('tx-status').value==='paid';
  state.transactions.push({id:crypto.randomUUID(),kind:activeKind,description,amount,category,date,dueDate:date,paymentDate:paid?date:null,paid,status:paid?'paid':'pending',method:document.getElementById('tx-method').value,card:document.getElementById('tx-card').value.trim(),installment:document.getElementById('tx-installment').value.trim(),note:document.getElementById('tx-note').value.trim(),createdAt:Date.now()});
  const txDate=dateObj(date);monthCursor=new Date(txDate.getFullYear(),txDate.getMonth(),1);
  document.getElementById('transaction-dialog').close();saveState();showToast('Lançamento salvo.');
}
function addGoal(event){
  event.preventDefault();
  const name=document.getElementById('goal-name').value.trim(),target=Number(document.getElementById('goal-target').value),saved=Number(document.getElementById('goal-saved').value||0);
  if(!name||target<=0||saved<0)return;
  state.goals.push({id:crypto.randomUUID(),name,target,saved});document.getElementById('goal-dialog').close();saveState();showToast('Meta criada.');
}
function exportBackup(){
  const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),...state},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`meu-financeiro-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);showToast('Cópia de segurança baixada.');
}
function importBackup(file){
  if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);if(!Array.isArray(data.transactions)||!Array.isArray(data.goals))throw new Error('invalid');state={transactions:data.transactions.filter(t=>t&&['receita','despesa','investimento'].includes(t.kind)&&Number.isFinite(Number(t.amount))&&t.date).map(t=>({...t,amount:Number(t.amount),paid:typeof t.paid==='boolean'?t.paid:true})),goals:data.goals.filter(g=>g&&g.name&&Number(g.target)>0).map(g=>({...g,target:Number(g.target),saved:Number(g.saved)||0})),categories:data.categories&&typeof data.categories==='object'?data.categories:{},budgets:Array.isArray(data.budgets)?data.budgets:[],cards:Array.isArray(data.cards)?data.cards:[]};saveState();document.getElementById('backup-dialog').close();showToast('Cópia restaurada.');}catch{showToast('Não foi possível ler esse arquivo.');}};reader.readAsText(file);
}

document.addEventListener('click',event=>{
  const nav=event.target.closest('[data-nav]');if(nav){if(nav.dataset.nav==='admin'&&currentProfile?.role!=='admin'){showToast('Acesso restrito ao administrador.');return;}switchView(nav.dataset.nav);return;}
  const open=event.target.closest('[data-open-view]');if(open){switchView(open.dataset.openView);return;}
  const reportTab=event.target.closest('[data-report-filter]');if(reportTab){reportFilter=reportTab.dataset.reportFilter;renderReports();return;}
  if(event.target.closest('#report-pdf')){exportReportPdf();return;}
  if(event.target.closest('#report-export')){exportReportCsv();return;}
  const shift=event.target.closest('[data-month-shift]');if(shift){monthCursor.setMonth(monthCursor.getMonth()+Number(shift.dataset.monthShift));renderAll();return;}
  const addTx=event.target.closest('[data-add-transaction]');if(addTx){openTransaction('despesa');return;}
  const addInv=event.target.closest('[data-add-investment]');if(addInv){openTransaction('investimento');return;}
  const addGoalButton=event.target.closest('[data-add-goal]');if(addGoalButton||event.target.closest('#add-goal')){document.getElementById('goal-form').reset();document.getElementById('goal-saved').value='0';document.getElementById('goal-dialog').showModal();return;}
  const filter=event.target.closest('[data-filter]');if(filter){activeFilter=filter.dataset.filter;document.querySelectorAll('.filter-pill').forEach(b=>b.classList.toggle('active',b===filter));renderTransactions();return;}
  const del=event.target.closest('[data-delete-transaction]');if(del){if(confirm('Apagar este lançamento?')){state.transactions=state.transactions.filter(t=>t.id!==del.dataset.deleteTransaction);saveState();showToast('Lançamento apagado.');}return;}
  const paid=event.target.closest('[data-set-paid]');if(paid){const tx=state.transactions.find(t=>t.id===paid.dataset.setPaid);if(tx){const d=new Date();const date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;tx.paid=true;tx.status='paid';tx.paymentDate=date;tx.date=date;monthCursor=new Date(d.getFullYear(),d.getMonth(),1);saveState();showToast('Lançamento marcado como realizado.');}return;}
  const goalAdd=event.target.closest('[data-goal-add]');if(goalAdd){const g=state.goals.find(x=>x.id===goalAdd.dataset.goalAdd);const n=Number(prompt(`Quanto deseja adicionar à meta “${g.name}”?`,''));if(Number.isFinite(n)&&n>0){g.saved+=n;saveState();showToast('Progresso atualizado.');}return;}
  const goalDelete=event.target.closest('[data-goal-delete]');if(goalDelete){if(confirm('Apagar esta meta?')){state.goals=state.goals.filter(g=>g.id!==goalDelete.dataset.goalDelete);saveState();showToast('Meta apagada.');}return;}
  if(event.target.closest('#backup-button')){document.getElementById('backup-dialog').showModal();return;}
  if(event.target.closest('#admin-refresh')){loadAdminUsers().catch(showCloudError);return;}
  const adminSave=event.target.closest('[data-admin-save]');if(adminSave){const card=adminSave.closest('[data-user-card]'),user=adminUsers.find(u=>u.user_id===adminSave.dataset.adminSave);if(!user||user.role==='admin'||user.user_id===currentUser?.id){showToast('Esta conta não pode ser alterada por aqui.');return;}const plan=card.querySelector('[data-admin-plan]').value,status=card.querySelector('[data-admin-status]').value;adminSave.disabled=true;cloud.rpc('admin_update_account',{p_target_user_id:user.user_id,p_plan_key:plan,p_subscription_status:status}).then(({error})=>{if(error)throw error;showToast('Conta atualizada e registrada no histórico.');return loadAdminUsers();}).catch(showCloudError).finally(()=>adminSave.disabled=false);return;}
  if(event.target.closest('#export-data')){exportBackup();return;}
  if(event.target.closest('#clear-data')){if(confirm('Apagar todos os lançamentos e metas deste aparelho? Esta ação não pode ser desfeita.')){state={transactions:[],goals:[],categories:{},budgets:[],cards:[]};saveState();document.getElementById('backup-dialog').close();showToast('Dados apagados.');}return;}
  const closer=event.target.closest('[data-close-dialog]');if(closer){closer.closest('dialog').close();}
});
document.querySelectorAll('.type-option').forEach(button=>button.addEventListener('click',()=>{activeKind=button.dataset.kind;document.querySelectorAll('.type-option').forEach(b=>b.classList.toggle('active',b===button));fillCategories();}));
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('keydown',event=>{if(event.key==='Enter'){button.click();}}));
document.getElementById('transaction-form').addEventListener('submit',addTransaction);
document.getElementById('goal-form').addEventListener('submit',addGoal);
document.getElementById('account-button').addEventListener('click',()=>{document.getElementById('auth-title').textContent=currentUser?'Conta conectada':'Acesse sua conta';document.getElementById('auth-signout').classList.toggle('hidden',!currentUser);if(!document.getElementById('auth-dialog').open)document.getElementById('auth-dialog').showModal();});
document.getElementById('auth-signup').addEventListener('click',()=>{authMode=authMode==='login'?'signup':'login';document.getElementById('auth-title').textContent=authMode==='signup'?'Criar sua conta':'Acesse sua conta';document.getElementById('auth-submit').textContent=authMode==='signup'?'Criar conta':'Entrar';document.getElementById('auth-signup').textContent=authMode==='signup'?'Já tenho conta':'Criar conta';});
document.getElementById('auth-form').addEventListener('submit',async event=>{event.preventDefault();const email=document.getElementById('auth-email').value.trim(),password=document.getElementById('auth-password').value;const submit=document.getElementById('auth-submit');submit.disabled=true;try{if(!cloud)throw new Error('Biblioteca do Supabase não carregou; verifique sua conexão.');const result=authMode==='signup'?await cloud.auth.signUp({email,password}):await cloud.auth.signInWithPassword({email,password});if(result.error)throw result.error;if(authMode==='signup'&&!result.data.session){showToast('Conta criada. Confirme o e-mail para entrar.');return;}authMode='login';}catch(error){showToast(error.message||'Não foi possível entrar.');}finally{submit.disabled=false;}});
document.getElementById('auth-signout').addEventListener('click',async()=>{await cloud.auth.signOut();state={transactions:[],goals:[],categories:{},budgets:[],cards:[]};localStorage.setItem(STORAGE_KEY,JSON.stringify(state));document.getElementById('auth-signout').classList.add('hidden');showToast('Você saiu da conta.');});
document.getElementById('admin-search').addEventListener('input',renderAdminUsers);
document.getElementById('import-file').addEventListener('change',event=>importBackup(event.target.files[0]));
document.getElementById('install-button').addEventListener('click',async()=>{
  const help=document.getElementById('install-help');
  const action=document.getElementById('install-action');
  const dialog=document.getElementById('install-dialog');
  const isInstalled=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid=/android/i.test(navigator.userAgent);
  action.classList.toggle('hidden',!installPrompt);
  if(isInstalled)help.textContent='O aplicativo já está instalado neste aparelho. Abra-o pelo ícone Meu Financeiro na tela inicial.';
  else if(installPrompt)help.textContent='Adicione o aplicativo à tela inicial para abrir em uma janela própria. Toque em “Instalar aplicativo” e confirme a instalação.';
  else if(isIOS)help.textContent='No iPhone ou iPad: abra este endereço no Safari, toque em Compartilhar (quadrado com seta para cima) e escolha “Adicionar à Tela de Início”.';
  else if(isAndroid)help.textContent='No Android: abra este endereço no Chrome, toque no menu ⋮ e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”. Se a opção não aparecer, atualize a página e tente novamente.';
  else help.textContent='No menu do navegador, escolha “Instalar aplicativo” ou “Adicionar à tela inicial”. Para instalar no iPhone, use Safari; no Android, use Chrome.';
  if(!dialog.open)dialog.showModal();
});
document.getElementById('install-action').addEventListener('click',async()=>{
  if(!installPrompt)return;
  const promptEvent=installPrompt;
  installPrompt=null;
  try{await promptEvent.prompt();const result=await promptEvent.userChoice;if(result.outcome==='accepted'){document.getElementById('install-dialog').close();showToast('Aplicativo instalado.');}}
  catch(error){console.error('Falha ao abrir instalação PWA:',error);showToast('Não foi possível abrir a instalação. Use o menu do navegador.');}
});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;document.getElementById('install-button').classList.add('install-ready');});
window.addEventListener('appinstalled',()=>{installPrompt=null;document.getElementById('install-dialog').close();showToast('Aplicativo instalado.');});
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./service-worker.js').catch(error=>console.error('Falha ao registrar o service worker:',error));
document.getElementById('today-label').textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long'}).format(today).toUpperCase();
renderAll();
if(cloud){cloud.auth.onAuthStateChange((event,session)=>{if(['SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(event))setTimeout(()=>handleSession(session),0);});cloud.auth.getSession().then(({data})=>handleSession(data.session));}
