// ============================================================
// PROPOSALS MODULE
// ============================================================
const DEFAULT_SCOPE=`• Installation and termination of data cable drops
• Provide and install wall-mounted network rack
• Provide and install CAT6 patch panel, 1U RMS
• Provide and install flush-mounted faceplates
• Supply and install J-hooks, ceiling wire, and Velcro for cable support`;

const DEFAULT_EXCL=`• Conduit pathways, core drilling, or grounding
• Blocking, power, or digital content installation
• Demolition/removal of existing data cabling
• UPS/PDU units
• Lift equipment (to be provided by customer unless otherwise agreed) — if not available, NetFiber can supply lift equipment and invoice at cost`;

let currentProposalId=null;
let pedItems=[];
let pedGCs=[];
let invProposal=null;
let invWorkItems=[];

async function renderProposals(){
  const mc=document.getElementById('main-content');
  mc.innerHTML=`
    <div class="page-hdr">
      <div><div class="page-title">Proposals</div><div class="page-sub">Estimates, invoices & scope of work</div></div>
      <button class="btn btn-blue" onclick="openNewProposal()">+ New Proposal</button>
    </div>
    <div class="toolbar">
      <input type="text" id="prop-search" placeholder="Search proposals..." oninput="filterProposals()" style="flex:1;min-width:180px">
      <select id="prop-filter" onchange="filterProposals()">
        <option value="">All statuses</option>
        <option>Draft</option><option>Sent</option><option>Approved</option><option>Lost</option>
      </select>
    </div>
    <div id="proposals-grid"><div class="loading"><span class="spinner"></span></div></div>`;
  await loadProposals();
}

let _proposals=[];
async function loadProposals(){
  const {data:rows=[]}=await sb.from('proposals').select('*').order('created_at',{ascending:false});
  _proposals=rows;
  filterProposals();
}

function filterProposals(){
  const search=(document.getElementById('prop-search')?.value||'').toLowerCase();
  const filter=document.getElementById('prop-filter')?.value||'';
  let rows=[..._proposals];
  if(filter)rows=rows.filter(r=>r.status===filter);
  if(search)rows=rows.filter(r=>(r.project_name+r.estimate_no+r.bill_to_company).toLowerCase().includes(search));
  const grid=document.getElementById('proposals-grid');
  if(!grid)return;
  const statusColors={Draft:'b-review',Sent:'b-sent',Approved:'b-win',Lost:'b-lost'};
  grid.innerHTML=rows.length?`<div class="prop-grid">${rows.map(r=>`
    <div class="prop-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:4px">
        <div class="prop-name">${r.project_name||'Untitled'}</div>
        <span class="badge ${statusColors[r.status]||'b-review'}" style="flex-shrink:0;margin-left:8px">${r.status||'Draft'}</span>
      </div>
      <div class="prop-sub">${r.estimate_no||''} ${r.bill_to_company?'· '+r.bill_to_company:''} ${r.date?'· '+fmtD(r.date):''}</div>
      <div class="prop-stats">
        <div class="prs"><div class="prs-v">${fmt$(r.subtotal)}</div><div class="prs-l">Subtotal</div></div>
        <div class="prs"><div class="prs-v" style="color:#888">${fmt$(r.tax_amount)}</div><div class="prs-l">Tax</div></div>
        <div class="prs"><div class="prs-v" style="color:#1B5E9B">${fmt$(r.total)}</div><div class="prs-l">Total</div></div>
      </div>
      <div class="prop-actions">
        <div class="prop-action-btn" onclick="openEditProposal('${r.id}')">✏️ Edit</div>
        <div class="prop-action-btn" onclick="printEstimate('${r.id}')">📄 Estimate</div>
        <div class="prop-action-btn green" onclick="openInvoice('${r.id}')">🧾 Invoice</div>
        <div class="prop-action-btn red" onclick="deleteProposal('${r.id}','${(r.project_name||'').replace(/'/g,'`')}')">🗑</div>
      </div>
    </div>`).join('')}</div>`:'<div class="tbl-wrap loading">No proposals yet. Create your first one.</div>';
}

// LINE ITEMS
function addLineItem(item={}){
  const id='li_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  pedItems.push({id,product:item.product_service||'',desc:item.description||'',qty:item.qty||1,rate:item.rate||0,amount:item.amount||0,cost:item.cost||0,margin:item.margin||0});
  renderLineItems();
}

function removeLineItem(id){
  pedItems=pedItems.filter(i=>i.id!==id);
  renderLineItems();
}

function renderLineItems(){
  const tbody=document.getElementById('ped-items');
  if(!tbody)return;
  tbody.innerHTML=pedItems.map((item,idx)=>`
    <tr>
      <td style="color:#aaa;font-size:11px;text-align:center">${idx+1}</td>
      <td><input value="${item.product}" onchange="updateItem('${item.id}','product',this.value)" placeholder="Cat6 Cable Drops"></td>
      <td><input value="${item.desc}" onchange="updateItem('${item.id}','desc',this.value)" placeholder="Description..."></td>
      <td><input type="number" value="${item.qty}" onchange="updateItem('${item.id}','qty',this.value)" min="0" step="0.01"></td>
      <td><input type="number" value="${item.rate}" onchange="updateItem('${item.id}','rate',this.value)" min="0" step="0.01"></td>
      <td style="font-weight:600;color:#1B5E9B">${fmt$(item.amount)}</td>
      <td class="internal-col"><input type="number" value="${item.cost}" onchange="updateItem('${item.id}','cost',this.value)" min="0" step="0.01" style="background:#FFFDF5"></td>
      <td class="internal-col"><input type="number" value="${item.margin}" onchange="updateItem('${item.id}','margin',this.value)" min="0" step="0.1" style="background:#FFFDF5" placeholder="30"></td>
      <td><button class="btn-danger" onclick="removeLineItem('${item.id}')" style="padding:3px 7px">×</button></td>
    </tr>`).join('');
  calcTotals();
}

function updateItem(id,field,val){
  const item=pedItems.find(i=>i.id===id);
  if(!item)return;
  item[field]=field==='product'||field==='desc'?val:parseFloat(val)||0;
  if(field==='qty'||field==='rate') item.amount=Math.round(item.qty*item.rate*100)/100;
  renderLineItems();
}

function calcTotals(){
  const subtotal=Math.round(pedItems.reduce((s,i)=>s+i.amount,0)*100)/100;
  const taxRate=parseFloat(document.getElementById('ped-taxrate')?.value||8.25);
  const tax=Math.round(subtotal*taxRate/100*100)/100;
  const total=Math.round((subtotal+tax)*100)/100;
  const el=id=>document.getElementById(id);
  if(el('ped-subtotal'))el('ped-subtotal').textContent=fmt$(subtotal);
  if(el('ped-tax'))el('ped-tax').textContent=fmt$(tax);
  if(el('ped-total'))el('ped-total').textContent=fmt$(total);
  if(el('ped-taxrate-display'))el('ped-taxrate-display').textContent=taxRate;
  return{subtotal,tax,total,taxRate};
}

// GC ROWS
function addGCRow(gc={}){
  const id='gc_'+Date.now();
  pedGCs.push({id,company:gc.company||'',contact:gc.contact_name||'',address:gc.address||'',email:gc.email||'',phone:gc.phone||'',primary:gc.is_primary||pedGCs.length===0});
  renderGCRows();
}

function renderGCRows(){
  const wrap=document.getElementById('ped-gcs');
  if(!wrap)return;
  wrap.innerHTML=pedGCs.map((gc,i)=>`
    <div class="gc-card ${gc.primary?'primary':''}">
      ${gc.primary?'<div style="font-size:10px;font-weight:700;color:#1B5E9B;margin-bottom:8px">PRIMARY GC (Bill To)</div>':'<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:10px;color:#aaa">Additional GC</span><button class="btn-sm" onclick="setPrimaryGC('${gc.id}')">Set as Primary</button></div>'}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">
        <div class="ifield"><label>Company</label><input value="${gc.company}" onchange="updateGC('${gc.id}','company',this.value)" placeholder="Westmoreland Builders"></div>
        <div class="ifield"><label>Contact Name</label><input value="${gc.contact}" onchange="updateGC('${gc.id}','contact',this.value)" placeholder="John Smith"></div>
        <div class="ifield"><label>Phone</label><input value="${gc.phone}" onchange="updateGC('${gc.id}','phone',this.value)" placeholder="(555) 000-0000"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="ifield"><label>Address</label><input value="${gc.address}" onchange="updateGC('${gc.id}','address',this.value)" placeholder="2301 Mustang Dr, Grapevine TX 76051"></div>
        <div class="ifield"><label>Email</label><input value="${gc.email}" onchange="updateGC('${gc.id}','email',this.value)" placeholder="estimating@company.com"></div>
      </div>
      ${!gc.primary?`<div style="margin-top:8px;text-align:right"><button class="btn-danger" onclick="removeGCRow('${gc.id}')">Remove</button></div>`:''}
    </div>`).join('');
}

function updateGC(id,field,val){const gc=pedGCs.find(g=>g.id===id);if(gc)gc[field]=val;}
function setPrimaryGC(id){pedGCs.forEach(g=>g.primary=g.id===id);renderGCRows();}
function removeGCRow(id){pedGCs=pedGCs.filter(g=>g.id!==id);renderGCRows();}

// OPEN / SAVE
async function openNewProposal(){
  currentProposalId=null;
  pedItems=[];pedGCs=[];
  document.getElementById('ped-title').textContent='New Proposal';
  document.getElementById('ped-estno').value='';
  document.getElementById('ped-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('ped-status').value='Draft';
  document.getElementById('ped-projname').value='';
  document.getElementById('ped-projaddr').value='';
  document.getElementById('ped-scope').value=DEFAULT_SCOPE;
  document.getElementById('ped-excl').value=DEFAULT_EXCL;
  document.getElementById('ped-notes').value='';
  document.getElementById('ped-taxrate').value='8.25';
  addGCRow();
  renderLineItems();
  document.getElementById('proposal-editor-modal').classList.add('open');
}

async function openEditProposal(id){
  currentProposalId=id;
  const [{data:prop},{data:items=[]},{data:gcs=[]}]=await Promise.all([
    sb.from('proposals').select('*').eq('id',id).single(),
    sb.from('proposal_items').select('*').eq('proposal_id',id).order('sort_order'),
    sb.from('proposal_gcs').select('*').eq('proposal_id',id)
  ]);
  if(!prop)return;
  document.getElementById('ped-title').textContent='Edit Proposal';
  document.getElementById('ped-estno').value=prop.estimate_no||'';
  document.getElementById('ped-date').value=prop.date||new Date().toISOString().split('T')[0];
  document.getElementById('ped-status').value=prop.status||'Draft';
  document.getElementById('ped-projname').value=prop.project_name||'';
  document.getElementById('ped-projaddr').value=prop.ship_to_address||'';
  document.getElementById('ped-scope').value=prop.scope_of_work||DEFAULT_SCOPE;
  document.getElementById('ped-excl').value=prop.exclusions||DEFAULT_EXCL;
  document.getElementById('ped-notes').value=prop.notes||'';
  document.getElementById('ped-taxrate').value=prop.tax_rate||8.25;
  pedGCs=gcs.map(g=>({id:'gc_'+g.id,dbId:g.id,company:g.company||'',contact:g.contact_name||'',address:g.address||'',email:g.email||'',phone:g.phone||'',primary:g.is_primary}));
  if(!pedGCs.length)addGCRow();
  else renderGCRows();
  pedItems=items.map(i=>({id:'li_'+i.id,dbId:i.id,product:i.product_service||'',desc:i.description||'',qty:i.qty||0,rate:i.rate||0,amount:i.amount||0,cost:i.cost||0,margin:i.margin||0}));
  renderLineItems();
  document.getElementById('proposal-editor-modal').classList.add('open');
}

async function saveProposal(){
  const {subtotal,tax,total,taxRate}=calcTotals();
  const primaryGC=pedGCs.find(g=>g.primary)||pedGCs[0]||{};
  const propData={
    estimate_no:document.getElementById('ped-estno').value,
    project_name:document.getElementById('ped-projname').value,
    ship_to_address:document.getElementById('ped-projaddr').value,
    date:document.getElementById('ped-date').value||null,
    status:document.getElementById('ped-status').value,
    bill_to_company:primaryGC.company||'',
    bill_to_name:primaryGC.contact||'',
    bill_to_address:primaryGC.address||'',
    scope_of_work:document.getElementById('ped-scope').value,
    exclusions:document.getElementById('ped-excl').value,
    notes:document.getElementById('ped-notes').value,
    tax_rate:taxRate,subtotal,tax_amount:tax,total,
    updated_by:CU.id,updated_at:new Date().toISOString()
  };

  let propId=currentProposalId;
  if(propId){
    await sb.from('proposals').update(propData).eq('id',propId);
    await sb.from('proposal_items').delete().eq('proposal_id',propId);
    await sb.from('proposal_gcs').delete().eq('proposal_id',propId);
  } else {
    propData.created_by=CU.id;
    const {data:np}=await sb.from('proposals').insert(propData).select().single();
    propId=np.id;
  }

  if(pedItems.length){
    await sb.from('proposal_items').insert(pedItems.map((item,idx)=>({
      proposal_id:propId,sort_order:idx,
      product_service:item.product,description:item.desc,
      qty:item.qty,rate:item.rate,amount:item.amount,
      cost:item.cost,margin:item.margin
    })));
  }

  if(pedGCs.length){
    await sb.from('proposal_gcs').insert(pedGCs.map(gc=>({
      proposal_id:propId,company:gc.company,contact_name:gc.contact,
      address:gc.address,email:gc.email,phone:gc.phone,is_primary:gc.primary
    })));
  }

  await logAct('Saved proposal','proposals',propId,`Saved: ${propData.project_name}`);
  closeModal('proposal-editor-modal');
  await loadProposals();
}

async function deleteProposal(id,name){
  if(!confirm(`Delete proposal "${name}"?`))return;
  await sb.from('proposals').delete().eq('id',id);
  await loadProposals();
}

// PRINT ESTIMATE
async function printEstimate(id){
  const [{data:prop},{data:items=[]},{data:gcs=[]}]=await Promise.all([
    sb.from('proposals').select('*').eq('id',id).single(),
    sb.from('proposal_items').select('*').eq('proposal_id',id).order('sort_order'),
    sb.from('proposal_gcs').select('*').eq('proposal_id',id)
  ]);
  if(!prop)return;
  const primaryGC=gcs.find(g=>g.is_primary)||gcs[0]||{};
  const taxRate=prop.tax_rate||8.25;

  const doc=`<div class="print-doc">
    <!-- COVER PAGE -->
    <div style="text-align:center;padding:80px 40px;page-break-after:always;min-height:700px;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <div style="font-size:28px;font-weight:900;color:#1B5E9B;letter-spacing:-1px;margin-bottom:8px">NETFIBER</div>
      <div style="font-size:14px;color:#888;letter-spacing:2px;margin-bottom:60px">NETWORK CABLING SOLUTIONS</div>
      <div style="font-size:22px;font-weight:700;color:#111;margin-bottom:60px;max-width:500px;line-height:1.4">${prop.project_name||'Proposal'}</div>
      <table style="font-size:13px;color:#555;border-collapse:collapse;text-align:right;margin:0 auto">
        <tr><td style="padding:6px 20px;font-weight:700;color:#1B5E9B">PROPOSED TO:</td><td style="padding:6px 0">${primaryGC.company||''}</td></tr>
        <tr><td style="padding:6px 20px;font-weight:700;color:#1B5E9B">PREPARED BY:</td><td style="padding:6px 0">Ramadan Abunajie</td></tr>
        <tr><td style="padding:6px 20px;font-weight:700;color:#1B5E9B">DATE:</td><td style="padding:6px 0">${prop.date?new Date(prop.date+'T00:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}):''}</td></tr>
      </table>
      <div style="margin-top:80px;font-size:12px;color:#aaa;line-height:1.8">
        NetFiber Network Cabling Solutions LLC<br>
        4840 North Shepherd Dr #4303, Houston, Texas 77018<br>
        www.netfibernetwork.com
      </div>
    </div>

    <!-- ESTIMATE PAGE -->
    <div style="page-break-after:always">
      <div class="print-header">
        <div>
          <div class="print-co" style="font-size:11px;font-weight:700">ESTIMATE</div>
          <div class="print-co">NETFIBER NETWORK CABLING SOLUTIONS LLC</div>
          <div style="font-size:11px;color:#555;margin-top:2px">4840 North Shepherd Dr #4303, Houston, TX 77018</div>
        </div>
        <div class="print-contact">
          mabunajie@netfibernetwork.com<br>
          +1 (214) 542-7839<br>
          https://www.netfibernetwork.com/
        </div>
      </div>

      <div class="print-bill-row">
        <div class="print-bill-box">
          <div class="print-bill-label">Bill To</div>
          <div class="print-bill-content">
            <strong>${primaryGC.company||''}</strong><br>
            ${primaryGC.address||''}
          </div>
        </div>
        <div class="print-bill-box">
          <div class="print-bill-label">Ship To</div>
          <div class="print-bill-content">
            <strong>${prop.project_name||''}</strong><br>
            ${prop.ship_to_address||''}
          </div>
        </div>
      </div>

      <div class="print-est-detail">
        <strong>Estimate details</strong><br>
        Estimate no.: ${prop.estimate_no||''} &nbsp;&nbsp; Estimate date: ${prop.date?new Date(prop.date+'T00:00:00').toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'}):''}
      </div>

      <table class="print-table">
        <thead>
          <tr>
            <th style="width:30px">#</th>
            <th>Product / Service</th>
            <th>Description</th>
            <th style="width:70px;text-align:right">Qty/Hrs</th>
            <th style="width:80px;text-align:right">Rate</th>
            <th style="width:90px;text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item,i)=>`<tr>
            <td style="color:#888">${i+1}</td>
            <td><strong>${item.product_service||''}</strong></td>
            <td style="color:#555;font-size:11px">${item.description||''}</td>
            <td style="text-align:right">${item.qty}</td>
            <td style="text-align:right">$${Number(item.rate).toFixed(2)}</td>
            <td style="text-align:right;font-weight:600">$${Number(item.amount).toFixed(2)}</td>
          </tr>`).join('')}
        </tbody>
      </table>

      <div class="print-totals">
        <div class="print-totals-box">
          <div class="print-total-row"><span>Subtotal</span><span>$${Number(prop.subtotal).toFixed(2)}</span></div>
          <div class="print-total-row"><span>Sales tax (${taxRate}%)</span><span>$${Number(prop.tax_amount).toFixed(2)}</span></div>
          <div class="print-total-row bold"><span>Total</span><span>$${Number(prop.total).toFixed(2)}</span></div>
        </div>
      </div>

      <div class="print-sign">
        <div>
          <div class="print-sign-line">Accepted date</div>
        </div>
        <div>
          <div class="print-sign-line">Accepted by</div>
        </div>
      </div>
    </div>

    <!-- SCOPE & TERMS PAGE -->
    <div>
      <div style="font-size:16px;font-weight:700;color:#1B5E9B;margin-bottom:16px;text-align:center">NetFiber Network Cabling Solutions</div>
      <div style="font-size:13px;font-weight:600;text-align:center;color:#555;margin-bottom:20px">Project Scope & General Terms</div>

      <div class="print-scope">
        <h3>Scope of Work:</h3>
        <ul>${(prop.scope_of_work||DEFAULT_SCOPE).split('\n').filter(l=>l.trim()).map(l=>`<li>${l.replace(/^[•\-]\s*/,'')}</li>`).join('')}</ul>
      </div>

      <div class="print-scope">
        <h3>Exclusions:</h3>
        <ul>${(prop.exclusions||DEFAULT_EXCL).split('\n').filter(l=>l.trim()).map(l=>`<li>${l.replace(/^[•\-]\s*/,'')}</li>`).join('')}</ul>
      </div>

      <div class="print-scope">
        <h3>General Terms:</h3>
        <ul>
          <li>Work Start: Work will begin upon written notice to proceed and scheduling confirmation.</li>
          <li>Materials: Certain materials or special-order items may require pre-payment before ordering.</li>
          <li>Billing: Invoices will be submitted in progress, based on work completed or materials delivered.</li>
          <li>Final Payment: Due upon project completion unless otherwise agreed in writing.</li>
        </ul>
      </div>

      <div class="print-scope">
        <h3>Payment Expectations:</h3>
        <p style="font-size:12px;color:#333;line-height:1.7">NetFiber kindly requests timely payments to keep the project moving without delay. Specific payment schedules can be discussed and agreed upon prior to the start of work.</p>
      </div>

      <div class="print-scope">
        <h3>Notes:</h3>
        <ul>
          <li>Project pricing is valid for 30 days from the date of proposal.</li>
          <li>Any scope changes will require a written change order before proceeding.</li>
          ${prop.notes?`<li>${prop.notes}</li>`:''}
        </ul>
      </div>

      <div class="print-scope">
        <h3>Acknowledgment:</h3>
        <p style="font-size:12px;color:#333;line-height:1.7">By accepting this estimate or issuing a purchase order, the client agrees to the terms outlined above.</p>
      </div>

      <div class="print-thank">THANK YOU FOR THE OPPORTUNITY TO WORK WITH YOU!<br>
        <span style="font-weight:400;font-size:11px">We look forward to delivering professional, on-time results for your project.</span>
      </div>

      <div class="print-sign" style="margin-top:40px">
        <div><div class="print-sign-line">Signed</div><div style="margin-top:20px"><div class="print-sign-line">Print Name</div></div></div>
        <div><div class="print-sign-line">Date</div><div style="margin-top:20px"><div class="print-sign-line">Title</div></div></div>
      </div>
    </div>
  </div>`;

  const pa=document.getElementById('print-area');
  pa.innerHTML=doc;pa.style.display='block';
  window.print();
  setTimeout(()=>{pa.style.display='none';pa.innerHTML='';},1000);
}

// INVOICE
async function openInvoice(id){
  const [{data:prop},{data:items=[]}]=await Promise.all([
    sb.from('proposals').select('*').eq('id',id).single(),
    sb.from('proposal_items').select('*').eq('proposal_id',id).order('sort_order')
  ]);
  if(!prop)return;
  invProposal={...prop,items};
  invWorkItems=items.map((item,i)=>({id:'wi_'+i,text:item.product_service||'',done:true}));
  document.getElementById('inv-no').value='';
  document.getElementById('inv-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('inv-milestone').value='1';
  renderWorkItems();
  updateInvAmounts();
  document.getElementById('invoice-modal').classList.add('open');
}

function renderWorkItems(){
  const wrap=document.getElementById('inv-work-items');
  if(!wrap)return;
  wrap.innerHTML=invWorkItems.map(item=>`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <input type="text" value="${item.text}" onchange="updateWorkItem('${item.id}',this.value)" style="flex:1;padding:6px 10px;border:1px solid #e0e0e0;border-radius:7px;font-size:12px;outline:none">
      <button class="btn-danger" onclick="removeWorkItem('${item.id}')">×</button>
    </div>`).join('');
}

function addWorkItem(){invWorkItems.push({id:'wi_'+Date.now(),text:'',done:true});renderWorkItems();}
function updateWorkItem(id,val){const w=invWorkItems.find(i=>i.id===id);if(w)w.text=val;}
function removeWorkItem(id){invWorkItems=invWorkItems.filter(i=>i.id!==id);renderWorkItems();}

function updateInvAmounts(){
  if(!invProposal)return;
  const m=parseInt(document.getElementById('inv-milestone')?.value||1);
  const total=invProposal.total||0;
  const m1=Math.round(total*0.6*100)/100;
  const m2=Math.round(total*0.3*100)/100;
  const m3=Math.round((total-m1-m2)*100)/100;
  const amounts=[m1,m2,m3];
  const labels=['60% – Installation Phase','30% – After Testing & Certification','10% – Final Completion & Punch List'];
  const taxRate=invProposal.tax_rate||8.25;
  const curAmt=amounts[m-1];
  const curTax=Math.round(curAmt*taxRate/100*100)/100;
  const curTotal=Math.round((curAmt+curTax)*100)/100;

  const sched=document.getElementById('inv-schedule');
  if(!sched)return;
  sched.innerHTML=`
    <table class="print-milestone-table" style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:10px">
      <thead><tr><th>#</th><th>Milestone</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>
        ${amounts.map((amt,i)=>`<tr style="${i+1===m?'background:#EAF3DE;font-weight:700':''}">
          <td style="padding:7px 10px">${i+1}</td>
          <td style="padding:7px 10px">${labels[i]}</td>
          <td style="padding:7px 10px;text-align:right">${fmt$(amt)}</td>
        </tr>`).join('')}
        <tr><td colspan="2" style="padding:7px 10px;text-align:right;font-weight:700">Current Invoice (Milestone ${m}):</td><td style="padding:7px 10px;text-align:right;font-weight:700">${fmt$(curAmt)}</td></tr>
        <tr><td colspan="2" style="padding:7px 10px;text-align:right;color:#888">Tax (${taxRate}%)</td><td style="padding:7px 10px;text-align:right;color:#888">${fmt$(curTax)}</td></tr>
        <tr><td colspan="2" style="padding:7px 10px;text-align:right;font-weight:700;color:#1B5E9B">Total Due Now</td><td style="padding:7px 10px;text-align:right;font-weight:700;color:#1B5E9B">${fmt$(curTotal)}</td></tr>
      </tbody>
    </table>`;
}

async function printInvoice(){
  if(!invProposal)return;
  const m=parseInt(document.getElementById('inv-milestone').value||1);
  const invNo=document.getElementById('inv-no').value||'';
  const invDate=document.getElementById('inv-date').value||new Date().toISOString().split('T')[0];
  const total=invProposal.total||0;
  const m1=Math.round(total*0.6*100)/100;
  const m2=Math.round(total*0.3*100)/100;
  const m3=Math.round((total-m1-m2)*100)/100;
  const amounts=[m1,m2,m3];
  const labels=['60% – Installation Phase','30% – After Testing & Certification','10% – Final Completion & Punch List'];
  const taxRate=invProposal.tax_rate||8.25;
  const curAmt=amounts[m-1];
  const curTax=Math.round(curAmt*taxRate/100*100)/100;
  const curTotal=Math.round((curAmt+curTax)*100)/100;
  const fmtInvDate=new Date(invDate+'T00:00:00').toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'});

  const doc=`<div class="print-doc">
    <div class="print-header">
      <div>
        <div class="print-co" style="font-size:11px;font-weight:700">INVOICE</div>
        <div class="print-co">NETFIBER NETWORK CABLING SOLUTIONS LLC</div>
        <div style="font-size:11px;color:#555;margin-top:2px">4840 North Shepherd Dr #4303, Houston, TX 77018</div>
      </div>
      <div class="print-contact">
        mabunajie@netfibernetwork.com<br>+1 (214) 542-7839<br>https://www.netfibernetwork.com/
      </div>
    </div>
    <div class="print-bill-row">
      <div class="print-bill-box">
        <div class="print-bill-label">Bill To</div>
        <div class="print-bill-content">
          <strong>${invProposal.bill_to_company||''}</strong><br>
          ${invProposal.bill_to_address||''}
        </div>
      </div>
      <div class="print-bill-box">
        <div class="print-bill-label">Project</div>
        <div class="print-bill-content">
          <strong>${invProposal.project_name||''}</strong><br>
          ${invProposal.ship_to_address||''}
        </div>
      </div>
    </div>
    <div class="print-est-detail">
      <strong>Invoice #:</strong> ${invNo} &nbsp;&nbsp;
      <strong>Invoice Date:</strong> ${fmtInvDate} &nbsp;&nbsp;
      <strong>Terms:</strong> Progress Billing
    </div>
    <div class="print-scope"><h3>Work Completed To Date:</h3>
      <div>${invWorkItems.filter(w=>w.text).map((w,i)=>`<div class="print-work-item"><span style="color:#aaa;width:20px">${i+1}</span><span>${w.text}</span><span style="margin-left:auto;color:#1D9E75;font-size:11px;font-weight:600">Completed</span></div>`).join('')}</div>
    </div>
    <div class="print-scope"><h3>Progress Payment Schedule:</h3>
      <table class="print-table">
        <thead><tr><th>#</th><th>Milestone</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>
          ${amounts.map((amt,i)=>`<tr ${i+1===m?'style="background:#EAF3DE"':''}>
            <td>${i+1}</td><td>${labels[i]}</td><td style="text-align:right;font-weight:${i+1===m?'700':'400'}">${fmt$(amt)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="print-totals">
      <div class="print-totals-box">
        <div class="print-total-row"><span>Sub-Total (Milestone ${m})</span><span>${fmt$(curAmt)}</span></div>
        <div class="print-total-row"><span>Tax (${taxRate}%)</span><span>${fmt$(curTax)}</span></div>
        <div class="print-total-row bold"><span>Total Due</span><span>${fmt$(curTotal)}</span></div>
      </div>
    </div>
    <div class="print-thank">Thank you for your business!</div>
  </div>`;

  const pa=document.getElementById('print-area');
  pa.innerHTML=doc;pa.style.display='block';
  window.print();
  setTimeout(()=>{pa.style.display='none';pa.innerHTML='';},1000);
}

// Listen for tax rate changes
document.addEventListener('input',function(e){if(e.target&&e.target.id==='ped-taxrate')calcTotals();});


// ============================================================
// PROPOSALS MODULE
// ============================================================
const DEFAULT_SCOPE=`• Installation and termination of data cable drops
• Provide and install wall-mounted network rack
• Provide and install CAT6 patch panel, 1U RMS
• Provide and install flush-mounted faceplates
• Supply and install J-hooks, ceiling wire, and Velcro for cable support`;

const DEFAULT_EXCL=`• Conduit pathways, core drilling, or grounding
• Blocking, power, or digital content installation
• Demolition/removal of existing data cabling
• UPS/PDU units
• Lift equipment (to be provided by customer unless otherwise agreed) — if not available, NetFiber can supply lift equipment and invoice at cost`;

let currentProposalId=null;
let pedItems=[];
let pedGCs=[];
let invProposal=null;
let invWorkItems=[];

async function renderProposals(){
  const mc=document.getElementById('main-content');
  mc.innerHTML=`
    <div class="page-hdr">
      <div><div class="page-title">Proposals</div><div class="page-sub">Estimates, invoices & scope of work</div></div>
      <button class="btn btn-blue" onclick="openNewProposal()">+ New Proposal</button>
    </div>
    <div class="toolbar">
      <input type="text" id="prop-search" placeholder="Search proposals..." oninput="filterProposals()" style="flex:1;min-width:180px">
      <select id="prop-filter" onchange="filterProposals()">
        <option value="">All statuses</option>
        <option>Draft</option><option>Sent</option><option>Approved</option><option>Lost</option>
      </select>
    </div>
    <div id="proposals-grid"><div class="loading"><span class="spinner"></span></div></div>`;
  await loadProposals();
}

let _proposals=[];
async function loadProposals(){
  const {data:rows=[]}=await sb.from('proposals').select('*').order('created_at',{ascending:false});
  _proposals=rows;
  filterProposals();
}

function filterProposals(){
  const search=(document.getElementById('prop-search')?.value||'').toLowerCase();
  const filter=document.getElementById('prop-filter')?.value||'';
  let rows=[..._proposals];
  if(filter)rows=rows.filter(r=>r.status===filter);
  if(search)rows=rows.filter(r=>(r.project_name+r.estimate_no+r.bill_to_company).toLowerCase().includes(search));
  const grid=document.getElementById('proposals-grid');
  if(!grid)return;
  const statusColors={Draft:'b-review',Sent:'b-sent',Approved:'b-win',Lost:'b-lost'};
  grid.innerHTML=rows.length?`<div class="prop-grid">${rows.map(r=>`
    <div class="prop-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:4px">
        <div class="prop-name">${r.project_name||'Untitled'}</div>
        <span class="badge ${statusColors[r.status]||'b-review'}" style="flex-shrink:0;margin-left:8px">${r.status||'Draft'}</span>
      </div>
      <div class="prop-sub">${r.estimate_no||''} ${r.bill_to_company?'· '+r.bill_to_company:''} ${r.date?'· '+fmtD(r.date):''}</div>
      <div class="prop-stats">
        <div class="prs"><div class="prs-v">${fmt$(r.subtotal)}</div><div class="prs-l">Subtotal</div></div>
        <div class="prs"><div class="prs-v" style="color:#888">${fmt$(r.tax_amount)}</div><div class="prs-l">Tax</div></div>
        <div class="prs"><div class="prs-v" style="color:#1B5E9B">${fmt$(r.total)}</div><div class="prs-l">Total</div></div>
      </div>
      <div class="prop-actions">
        <div class="prop-action-btn" onclick="openEditProposal('${r.id}')">✏️ Edit</div>
        <div class="prop-action-btn" onclick="printEstimate('${r.id}')">📄 Estimate</div>
        <div class="prop-action-btn green" onclick="openInvoice('${r.id}')">🧾 Invoice</div>
        <div class="prop-action-btn red" onclick="deleteProposal('${r.id}','${(r.project_name||'').replace(/'/g,'`')}')">🗑</div>
      </div>
    </div>`).join('')}</div>`:'<div class="tbl-wrap loading">No proposals yet. Create your first one.</div>';
}

// LINE ITEMS
function addLineItem(item={}){
  const id='li_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  pedItems.push({id,product:item.product_service||'',desc:item.description||'',qty:item.qty||1,rate:item.rate||0,amount:item.amount||0,cost:item.cost||0,margin:item.margin||0});
  renderLineItems();
}

function removeLineItem(id){
  pedItems=pedItems.filter(i=>i.id!==id);
  renderLineItems();
}

function renderLineItems(){
  const tbody=document.getElementById('ped-items');
  if(!tbody)return;
  tbody.innerHTML=pedItems.map((item,idx)=>`
    <tr>
      <td style="color:#aaa;font-size:11px;text-align:center">${idx+1}</td>
      <td><input value="${item.product}" onchange="updateItem('${item.id}','product',this.value)" placeholder="Cat6 Cable Drops"></td>
      <td><input value="${item.desc}" onchange="updateItem('${item.id}','desc',this.value)" placeholder="Description..."></td>
      <td><input type="number" value="${item.qty}" onchange="updateItem('${item.id}','qty',this.value)" min="0" step="0.01"></td>
      <td><input type="number" value="${item.rate}" onchange="updateItem('${item.id}','rate',this.value)" min="0" step="0.01"></td>
      <td style="font-weight:600;color:#1B5E9B">${fmt$(item.amount)}</td>
      <td class="internal-col"><input type="number" value="${item.cost}" onchange="updateItem('${item.id}','cost',this.value)" min="0" step="0.01" style="background:#FFFDF5"></td>
      <td class="internal-col"><input type="number" value="${item.margin}" onchange="updateItem('${item.id}','margin',this.value)" min="0" step="0.1" style="background:#FFFDF5" placeholder="30"></td>
      <td><button class="btn-danger" onclick="removeLineItem('${item.id}')" style="padding:3px 7px">×</button></td>
    </tr>`).join('');
  calcTotals();
}

function updateItem(id,field,val){
  const item=pedItems.find(i=>i.id===id);
  if(!item)return;
  item[field]=field==='product'||field==='desc'?val:parseFloat(val)||0;
  if(field==='qty'||field==='rate') item.amount=Math.round(item.qty*item.rate*100)/100;
  renderLineItems();
}

function calcTotals(){
  const subtotal=Math.round(pedItems.reduce((s,i)=>s+i.amount,0)*100)/100;
  const taxRate=parseFloat(document.getElementById('ped-taxrate')?.value||8.25);
  const tax=Math.round(subtotal*taxRate/100*100)/100;
  const total=Math.round((subtotal+tax)*100)/100;
  const el=id=>document.getElementById(id);
  if(el('ped-subtotal'))el('ped-subtotal').textContent=fmt$(subtotal);
  if(el('ped-tax'))el('ped-tax').textContent=fmt$(tax);
  if(el('ped-total'))el('ped-total').textContent=fmt$(total);
  if(el('ped-taxrate-display'))el('ped-taxrate-display').textContent=taxRate;
  return{subtotal,tax,total,taxRate};
}

// GC ROWS
function addGCRow(gc={}){
  const id='gc_'+Date.now();
  pedGCs.push({id,company:gc.company||'',contact:gc.contact_name||'',address:gc.address||'',email:gc.email||'',phone:gc.phone||'',primary:gc.is_primary||pedGCs.length===0});
  renderGCRows();
}

function renderGCRows(){
  const wrap=document.getElementById('ped-gcs');
  if(!wrap)return;
  wrap.innerHTML=pedGCs.map((gc,i)=>`
    <div class="gc-card ${gc.primary?'primary':''}">
      ${gc.primary?'<div style="font-size:10px;font-weight:700;color:#1B5E9B;margin-bottom:8px">PRIMARY GC (Bill To)</div>':'<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:10px;color:#aaa">Additional GC</span><button class="btn-sm" onclick="setPrimaryGC('${gc.id}')">Set as Primary</button></div>'}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">
        <div class="ifield"><label>Company</label><input value="${gc.company}" onchange="updateGC('${gc.id}','company',this.value)" placeholder="Westmoreland Builders"></div>
        <div class="ifield"><label>Contact Name</label><input value="${gc.contact}" onchange="updateGC('${gc.id}','contact',this.value)" placeholder="John Smith"></div>
        <div class="ifield"><label>Phone</label><input value="${gc.phone}" onchange="updateGC('${gc.id}','phone',this.value)" placeholder="(555) 000-0000"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="ifield"><label>Address</label><input value="${gc.address}" onchange="updateGC('${gc.id}','address',this.value)" placeholder="2301 Mustang Dr, Grapevine TX 76051"></div>
        <div class="ifield"><label>Email</label><input value="${gc.email}" onchange="updateGC('${gc.id}','email',this.value)" placeholder="estimating@company.com"></div>
      </div>
      ${!gc.primary?`<div style="margin-top:8px;text-align:right"><button class="btn-danger" onclick="removeGCRow('${gc.id}')">Remove</button></div>`:''}
    </div>`).join('');
}

function updateGC(id,field,val){const gc=pedGCs.find(g=>g.id===id);if(gc)gc[field]=val;}
function setPrimaryGC(id){pedGCs.forEach(g=>g.primary=g.id===id);renderGCRows();}
function removeGCRow(id){pedGCs=pedGCs.filter(g=>g.id!==id);renderGCRows();}

// OPEN / SAVE
async function openNewProposal(){
  currentProposalId=null;
  pedItems=[];pedGCs=[];
  document.getElementById('ped-title').textContent='New Proposal';
  document.getElementById('ped-estno').value='';
  document.getElementById('ped-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('ped-status').value='Draft';
  document.getElementById('ped-projname').value='';
  document.getElementById('ped-projaddr').value='';
  document.getElementById('ped-scope').value=DEFAULT_SCOPE;
  document.getElementById('ped-excl').value=DEFAULT_EXCL;
  document.getElementById('ped-notes').value='';
  document.getElementById('ped-taxrate').value='8.25';
  addGCRow();
  renderLineItems();
  document.getElementById('proposal-editor-modal').classList.add('open');
}

async function openEditProposal(id){
  currentProposalId=id;
  const [{data:prop},{data:items=[]},{data:gcs=[]}]=await Promise.all([
    sb.from('proposals').select('*').eq('id',id).single(),
    sb.from('proposal_items').select('*').eq('proposal_id',id).order('sort_order'),
    sb.from('proposal_gcs').select('*').eq('proposal_id',id)
  ]);
  if(!prop)return;
  document.getElementById('ped-title').textContent='Edit Proposal';
  document.getElementById('ped-estno').value=prop.estimate_no||'';
  document.getElementById('ped-date').value=prop.date||new Date().toISOString().split('T')[0];
  document.getElementById('ped-status').value=prop.status||'Draft';
  document.getElementById('ped-projname').value=prop.project_name||'';
  document.getElementById('ped-projaddr').value=prop.ship_to_address||'';
  document.getElementById('ped-scope').value=prop.scope_of_work||DEFAULT_SCOPE;
  document.getElementById('ped-excl').value=prop.exclusions||DEFAULT_EXCL;
  document.getElementById('ped-notes').value=prop.notes||'';
  document.getElementById('ped-taxrate').value=prop.tax_rate||8.25;
  pedGCs=gcs.map(g=>({id:'gc_'+g.id,dbId:g.id,company:g.company||'',contact:g.contact_name||'',address:g.address||'',email:g.email||'',phone:g.phone||'',primary:g.is_primary}));
  if(!pedGCs.length)addGCRow();
  else renderGCRows();
  pedItems=items.map(i=>({id:'li_'+i.id,dbId:i.id,product:i.product_service||'',desc:i.description||'',qty:i.qty||0,rate:i.rate||0,amount:i.amount||0,cost:i.cost||0,margin:i.margin||0}));
  renderLineItems();
  document.getElementById('proposal-editor-modal').classList.add('open');
}

async function saveProposal(){
  const {subtotal,tax,total,taxRate}=calcTotals();
  const primaryGC=pedGCs.find(g=>g.primary)||pedGCs[0]||{};
  const propData={
    estimate_no:document.getElementById('ped-estno').value,
    project_name:document.getElementById('ped-projname').value,
    ship_to_address:document.getElementById('ped-projaddr').value,
    date:document.getElementById('ped-date').value||null,
    status:document.getElementById('ped-status').value,
    bill_to_company:primaryGC.company||'',
    bill_to_name:primaryGC.contact||'',
    bill_to_address:primaryGC.address||'',
    scope_of_work:document.getElementById('ped-scope').value,
    exclusions:document.getElementById('ped-excl').value,
    notes:document.getElementById('ped-notes').value,
    tax_rate:taxRate,subtotal,tax_amount:tax,total,
    updated_by:CU.id,updated_at:new Date().toISOString()
  };

  let propId=currentProposalId;
  if(propId){
    await sb.from('proposals').update(propData).eq('id',propId);
    await sb.from('proposal_items').delete().eq('proposal_id',propId);
    await sb.from('proposal_gcs').delete().eq('proposal_id',propId);
  } else {
    propData.created_by=CU.id;
    const {data:np}=await sb.from('proposals').insert(propData).select().single();
    propId=np.id;
  }

  if(pedItems.length){
    await sb.from('proposal_items').insert(pedItems.map((item,idx)=>({
      proposal_id:propId,sort_order:idx,
      product_service:item.product,description:item.desc,
      qty:item.qty,rate:item.rate,amount:item.amount,
      cost:item.cost,margin:item.margin
    })));
  }

  if(pedGCs.length){
    await sb.from('proposal_gcs').insert(pedGCs.map(gc=>({
      proposal_id:propId,company:gc.company,contact_name:gc.contact,
      address:gc.address,email:gc.email,phone:gc.phone,is_primary:gc.primary
    })));
  }

  await logAct('Saved proposal','proposals',propId,`Saved: ${propData.project_name}`);
  closeModal('proposal-editor-modal');
  await loadProposals();
}

async function deleteProposal(id,name){
  if(!confirm(`Delete proposal "${name}"?`))return;
  await sb.from('proposals').delete().eq('id',id);
  await loadProposals();
}

// PRINT ESTIMATE
async function printEstimate(id){
  const [{data:prop},{data:items=[]},{data:gcs=[]}]=await Promise.all([
    sb.from('proposals').select('*').eq('id',id).single(),
    sb.from('proposal_items').select('*').eq('proposal_id',id).order('sort_order'),
    sb.from('proposal_gcs').select('*').eq('proposal_id',id)
  ]);
  if(!prop)return;
  const primaryGC=gcs.find(g=>g.is_primary)||gcs[0]||{};
  const taxRate=prop.tax_rate||8.25;

  const doc=`<div class="print-doc">
    <!-- COVER PAGE -->
    <div style="text-align:center;padding:80px 40px;page-break-after:always;min-height:700px;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <div style="font-size:28px;font-weight:900;color:#1B5E9B;letter-spacing:-1px;margin-bottom:8px">NETFIBER</div>
      <div style="font-size:14px;color:#888;letter-spacing:2px;margin-bottom:60px">NETWORK CABLING SOLUTIONS</div>
      <div style="font-size:22px;font-weight:700;color:#111;margin-bottom:60px;max-width:500px;line-height:1.4">${prop.project_name||'Proposal'}</div>
      <table style="font-size:13px;color:#555;border-collapse:collapse;text-align:right;margin:0 auto">
        <tr><td style="padding:6px 20px;font-weight:700;color:#1B5E9B">PROPOSED TO:</td><td style="padding:6px 0">${primaryGC.company||''}</td></tr>
        <tr><td style="padding:6px 20px;font-weight:700;color:#1B5E9B">PREPARED BY:</td><td style="padding:6px 0">Ramadan Abunajie</td></tr>
        <tr><td style="padding:6px 20px;font-weight:700;color:#1B5E9B">DATE:</td><td style="padding:6px 0">${prop.date?new Date(prop.date+'T00:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}):''}</td></tr>
      </table>
      <div style="margin-top:80px;font-size:12px;color:#aaa;line-height:1.8">
        NetFiber Network Cabling Solutions LLC<br>
        4840 North Shepherd Dr #4303, Houston, Texas 77018<br>
        www.netfibernetwork.com
      </div>
    </div>

    <!-- ESTIMATE PAGE -->
    <div style="page-break-after:always">
      <div class="print-header">
        <div>
          <div class="print-co" style="font-size:11px;font-weight:700">ESTIMATE</div>
          <div class="print-co">NETFIBER NETWORK CABLING SOLUTIONS LLC</div>
          <div style="font-size:11px;color:#555;margin-top:2px">4840 North Shepherd Dr #4303, Houston, TX 77018</div>
        </div>
        <div class="print-contact">
          mabunajie@netfibernetwork.com<br>
          +1 (214) 542-7839<br>
          https://www.netfibernetwork.com/
        </div>
      </div>

      <div class="print-bill-row">
        <div class="print-bill-box">
          <div class="print-bill-label">Bill To</div>
          <div class="print-bill-content">
            <strong>${primaryGC.company||''}</strong><br>
            ${primaryGC.address||''}
          </div>
        </div>
        <div class="print-bill-box">
          <div class="print-bill-label">Ship To</div>
          <div class="print-bill-content">
            <strong>${prop.project_name||''}</strong><br>
            ${prop.ship_to_address||''}
          </div>
        </div>
      </div>

      <div class="print-est-detail">
        <strong>Estimate details</strong><br>
        Estimate no.: ${prop.estimate_no||''} &nbsp;&nbsp; Estimate date: ${prop.date?new Date(prop.date+'T00:00:00').toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'}):''}
      </div>

      <table class="print-table">
        <thead>
          <tr>
            <th style="width:30px">#</th>
            <th>Product / Service</th>
            <th>Description</th>
            <th style="width:70px;text-align:right">Qty/Hrs</th>
            <th style="width:80px;text-align:right">Rate</th>
            <th style="width:90px;text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item,i)=>`<tr>
            <td style="color:#888">${i+1}</td>
            <td><strong>${item.product_service||''}</strong></td>
            <td style="color:#555;font-size:11px">${item.description||''}</td>
            <td style="text-align:right">${item.qty}</td>
            <td style="text-align:right">$${Number(item.rate).toFixed(2)}</td>
            <td style="text-align:right;font-weight:600">$${Number(item.amount).toFixed(2)}</td>
          </tr>`).join('')}
        </tbody>
      </table>

      <div class="print-totals">
        <div class="print-totals-box">
          <div class="print-total-row"><span>Subtotal</span><span>$${Number(prop.subtotal).toFixed(2)}</span></div>
          <div class="print-total-row"><span>Sales tax (${taxRate}%)</span><span>$${Number(prop.tax_amount).toFixed(2)}</span></div>
          <div class="print-total-row bold"><span>Total</span><span>$${Number(prop.total).toFixed(2)}</span></div>
        </div>
      </div>

      <div class="print-sign">
        <div>
          <div class="print-sign-line">Accepted date</div>
        </div>
        <div>
          <div class="print-sign-line">Accepted by</div>
        </div>
      </div>
    </div>

    <!-- SCOPE & TERMS PAGE -->
    <div>
      <div style="font-size:16px;font-weight:700;color:#1B5E9B;margin-bottom:16px;text-align:center">NetFiber Network Cabling Solutions</div>
      <div style="font-size:13px;font-weight:600;text-align:center;color:#555;margin-bottom:20px">Project Scope & General Terms</div>

      <div class="print-scope">
        <h3>Scope of Work:</h3>
        <ul>${(prop.scope_of_work||DEFAULT_SCOPE).split('\n').filter(l=>l.trim()).map(l=>`<li>${l.replace(/^[•\-]\s*/,'')}</li>`).join('')}</ul>
      </div>

      <div class="print-scope">
        <h3>Exclusions:</h3>
        <ul>${(prop.exclusions||DEFAULT_EXCL).split('\n').filter(l=>l.trim()).map(l=>`<li>${l.replace(/^[•\-]\s*/,'')}</li>`).join('')}</ul>
      </div>

      <div class="print-scope">
        <h3>General Terms:</h3>
        <ul>
          <li>Work Start: Work will begin upon written notice to proceed and scheduling confirmation.</li>
          <li>Materials: Certain materials or special-order items may require pre-payment before ordering.</li>
          <li>Billing: Invoices will be submitted in progress, based on work completed or materials delivered.</li>
          <li>Final Payment: Due upon project completion unless otherwise agreed in writing.</li>
        </ul>
      </div>

      <div class="print-scope">
        <h3>Payment Expectations:</h3>
        <p style="font-size:12px;color:#333;line-height:1.7">NetFiber kindly requests timely payments to keep the project moving without delay. Specific payment schedules can be discussed and agreed upon prior to the start of work.</p>
      </div>

      <div class="print-scope">
        <h3>Notes:</h3>
        <ul>
          <li>Project pricing is valid for 30 days from the date of proposal.</li>
          <li>Any scope changes will require a written change order before proceeding.</li>
          ${prop.notes?`<li>${prop.notes}</li>`:''}
        </ul>
      </div>

      <div class="print-scope">
        <h3>Acknowledgment:</h3>
        <p style="font-size:12px;color:#333;line-height:1.7">By accepting this estimate or issuing a purchase order, the client agrees to the terms outlined above.</p>
      </div>

      <div class="print-thank">THANK YOU FOR THE OPPORTUNITY TO WORK WITH YOU!<br>
        <span style="font-weight:400;font-size:11px">We look forward to delivering professional, on-time results for your project.</span>
      </div>

      <div class="print-sign" style="margin-top:40px">
        <div><div class="print-sign-line">Signed</div><div style="margin-top:20px"><div class="print-sign-line">Print Name</div></div></div>
        <div><div class="print-sign-line">Date</div><div style="margin-top:20px"><div class="print-sign-line">Title</div></div></div>
      </div>
    </div>
  </div>`;

  const pa=document.getElementById('print-area');
  pa.innerHTML=doc;pa.style.display='block';
  window.print();
  setTimeout(()=>{pa.style.display='none';pa.innerHTML='';},1000);
}

// INVOICE
async function openInvoice(id){
  const [{data:prop},{data:items=[]}]=await Promise.all([
    sb.from('proposals').select('*').eq('id',id).single(),
    sb.from('proposal_items').select('*').eq('proposal_id',id).order('sort_order')
  ]);
  if(!prop)return;
  invProposal={...prop,items};
  invWorkItems=items.map((item,i)=>({id:'wi_'+i,text:item.product_service||'',done:true}));
  document.getElementById('inv-no').value='';
  document.getElementById('inv-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('inv-milestone').value='1';
  renderWorkItems();
  updateInvAmounts();
  document.getElementById('invoice-modal').classList.add('open');
}

function renderWorkItems(){
  const wrap=document.getElementById('inv-work-items');
  if(!wrap)return;
  wrap.innerHTML=invWorkItems.map(item=>`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <input type="text" value="${item.text}" onchange="updateWorkItem('${item.id}',this.value)" style="flex:1;padding:6px 10px;border:1px solid #e0e0e0;border-radius:7px;font-size:12px;outline:none">
      <button class="btn-danger" onclick="removeWorkItem('${item.id}')">×</button>
    </div>`).join('');
}

function addWorkItem(){invWorkItems.push({id:'wi_'+Date.now(),text:'',done:true});renderWorkItems();}
function updateWorkItem(id,val){const w=invWorkItems.find(i=>i.id===id);if(w)w.text=val;}
function removeWorkItem(id){invWorkItems=invWorkItems.filter(i=>i.id!==id);renderWorkItems();}

function updateInvAmounts(){
  if(!invProposal)return;
  const m=parseInt(document.getElementById('inv-milestone')?.value||1);
  const total=invProposal.total||0;
  const m1=Math.round(total*0.6*100)/100;
  const m2=Math.round(total*0.3*100)/100;
  const m3=Math.round((total-m1-m2)*100)/100;
  const amounts=[m1,m2,m3];
  const labels=['60% – Installation Phase','30% – After Testing & Certification','10% – Final Completion & Punch List'];
  const taxRate=invProposal.tax_rate||8.25;
  const curAmt=amounts[m-1];
  const curTax=Math.round(curAmt*taxRate/100*100)/100;
  const curTotal=Math.round((curAmt+curTax)*100)/100;

  const sched=document.getElementById('inv-schedule');
  if(!sched)return;
  sched.innerHTML=`
    <table class="print-milestone-table" style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:10px">
      <thead><tr><th>#</th><th>Milestone</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>
        ${amounts.map((amt,i)=>`<tr style="${i+1===m?'background:#EAF3DE;font-weight:700':''}">
          <td style="padding:7px 10px">${i+1}</td>
          <td style="padding:7px 10px">${labels[i]}</td>
          <td style="padding:7px 10px;text-align:right">${fmt$(amt)}</td>
        </tr>`).join('')}
        <tr><td colspan="2" style="padding:7px 10px;text-align:right;font-weight:700">Current Invoice (Milestone ${m}):</td><td style="padding:7px 10px;text-align:right;font-weight:700">${fmt$(curAmt)}</td></tr>
        <tr><td colspan="2" style="padding:7px 10px;text-align:right;color:#888">Tax (${taxRate}%)</td><td style="padding:7px 10px;text-align:right;color:#888">${fmt$(curTax)}</td></tr>
        <tr><td colspan="2" style="padding:7px 10px;text-align:right;font-weight:700;color:#1B5E9B">Total Due Now</td><td style="padding:7px 10px;text-align:right;font-weight:700;color:#1B5E9B">${fmt$(curTotal)}</td></tr>
      </tbody>
    </table>`;
}

async function printInvoice(){
  if(!invProposal)return;
  const m=parseInt(document.getElementById('inv-milestone').value||1);
  const invNo=document.getElementById('inv-no').value||'';
  const invDate=document.getElementById('inv-date').value||new Date().toISOString().split('T')[0];
  const total=invProposal.total||0;
  const m1=Math.round(total*0.6*100)/100;
  const m2=Math.round(total*0.3*100)/100;
  const m3=Math.round((total-m1-m2)*100)/100;
  const amounts=[m1,m2,m3];
  const labels=['60% – Installation Phase','30% – After Testing & Certification','10% – Final Completion & Punch List'];
  const taxRate=invProposal.tax_rate||8.25;
  const curAmt=amounts[m-1];
  const curTax=Math.round(curAmt*taxRate/100*100)/100;
  const curTotal=Math.round((curAmt+curTax)*100)/100;
  const fmtInvDate=new Date(invDate+'T00:00:00').toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'});

  const doc=`<div class="print-doc">
    <div class="print-header">
      <div>
        <div class="print-co" style="font-size:11px;font-weight:700">INVOICE</div>
        <div class="print-co">NETFIBER NETWORK CABLING SOLUTIONS LLC</div>
        <div style="font-size:11px;color:#555;margin-top:2px">4840 North Shepherd Dr #4303, Houston, TX 77018</div>
      </div>
      <div class="print-contact">
        mabunajie@netfibernetwork.com<br>+1 (214) 542-7839<br>https://www.netfibernetwork.com/
      </div>
    </div>
    <div class="print-bill-row">
      <div class="print-bill-box">
        <div class="print-bill-label">Bill To</div>
        <div class="print-bill-content">
          <strong>${invProposal.bill_to_company||''}</strong><br>
          ${invProposal.bill_to_address||''}
        </div>
      </div>
      <div class="print-bill-box">
        <div class="print-bill-label">Project</div>
        <div class="print-bill-content">
          <strong>${invProposal.project_name||''}</strong><br>
          ${invProposal.ship_to_address||''}
        </div>
      </div>
    </div>
    <div class="print-est-detail">
      <strong>Invoice #:</strong> ${invNo} &nbsp;&nbsp;
      <strong>Invoice Date:</strong> ${fmtInvDate} &nbsp;&nbsp;
      <strong>Terms:</strong> Progress Billing
    </div>
    <div class="print-scope"><h3>Work Completed To Date:</h3>
      <div>${invWorkItems.filter(w=>w.text).map((w,i)=>`<div class="print-work-item"><span style="color:#aaa;width:20px">${i+1}</span><span>${w.text}</span><span style="margin-left:auto;color:#1D9E75;font-size:11px;font-weight:600">Completed</span></div>`).join('')}</div>
    </div>
    <div class="print-scope"><h3>Progress Payment Schedule:</h3>
      <table class="print-table">
        <thead><tr><th>#</th><th>Milestone</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>
          ${amounts.map((amt,i)=>`<tr ${i+1===m?'style="background:#EAF3DE"':''}>
            <td>${i+1}</td><td>${labels[i]}</td><td style="text-align:right;font-weight:${i+1===m?'700':'400'}">${fmt$(amt)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="print-totals">
      <div class="print-totals-box">
        <div class="print-total-row"><span>Sub-Total (Milestone ${m})</span><span>${fmt$(curAmt)}</span></div>
        <div class="print-total-row"><span>Tax (${taxRate}%)</span><span>${fmt$(curTax)}</span></div>
        <div class="print-total-row bold"><span>Total Due</span><span>${fmt$(curTotal)}</span></div>
      </div>
    </div>
    <div class="print-thank">Thank you for your business!</div>
  </div>`;

  const pa=document.getElementById('print-area');
  pa.innerHTML=doc;pa.style.display='block';
  window.print();
  setTimeout(()=>{pa.style.display='none';pa.innerHTML='';},1000);
}

// Listen for tax rate changes
document.addEventListener('input',function(e){if(e.target&&e.target.id==='ped-taxrate')calcTotals();});

