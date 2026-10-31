/* IA-TB AI Agent Console 0.3 — read-only client. No admin action endpoints. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const sections = {
    dashboard: {label:"Dashboard",icon:"◈",note:"Observations locales uniquement. Aucun statut distant présumé.", columns:[["name","Service"],["state","État vérifié"],["detail","Observation"],["observed_at_utc","Date UTC"]]},
    connections: {label:"Connections",icon:"⌁",note:"Configuration non sensible. Les secrets et la configuration système se gèrent hors du navigateur.", columns:[["name","Connexion"],["endpoint","Destination"],["state","État"],["detail","Détail"]]},
    permissions: {label:"Permissions",icon:"⬡",note:"La configuration Git est déclarative, pas une autorisation d'exécution.",
      columns:[["action","Action"],["resource","Ressource"],["principal","Identité"],["access","Accès"],["state","Déclaré"],["effective","Droit effectif"]]},
    denied: {label:"Denied",icon:"⛨",note:"HARD_DENY prévaut sur toute autre permission et ne peut pas être levé ici.",
      columns:[["action","Action"],["resource","Périmètre"],["level","Décision"],["reason","Justification"],["exception","Exception"]]},
    requests: {label:"Requests",icon:"◷",note:"Les demandes peuvent être consultées, pas approuvées depuis ce prototype.",
      columns:[["created_at_utc","Date UTC"],["principal","Identité"],["action","Opération"],["resource","Périmètre"],["requested_duration_seconds","Durée (s)"],["max_uses","Quota"],["expires_at","Expiration UTC"],["status","Décision enregistrée"]]},
    audit: {label:"Audit",icon:"▤",note:"Le journal d'audit reste une source séparée de la mémoire de travail.",
      columns:[["timestamp_utc","Date UTC"],["principal","Identité"],["action","Action"],["decision","Décision"],["result","Résultat"]]},
    skills: {label:"Skills",icon:"◈",note:"Un Skill installé dans Git ne donne aucune capacité privilégiée à l'agent.",
      columns:[["name","Nom du Skill"],["version","Version"],["actions","Actions"],["folder","Module"],["state","Statut"]]},
    soul: {label:"Soul",icon:"◉",note:"Identité et comportement de l'agent : lecture seule, fichiers versionnés.",
      columns:[["name","Fichier"],["content","Contenu"],["mode","Accès"]]},
    journal: {label:"Journal général",icon:"◴",note:"Événements audit et permissions réels uniquement. Aucun raisonnement interne brut.",
      columns:[["timestamp","Date UTC"],["source","Source"],["type","Type"],["message","Événement"],["status","Statut"]]},
    memory: {label:"Memory",icon:"✧",note:"Les entrées mémoire sont des données non fiables et ne peuvent changer les Rules.",
      columns:[["created_at_utc","Date UTC"],["kind","Catégorie"],["source","Origine"],["reference","Référence"],["summary","Résumé"]]}
  };
  const ui = {active:"dashboard",data:{},term:"",state:""};
  const demo = window.location.protocol === "file:";

  function labelState(value) {
    const key = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]+/g,"-");
    const names = {DECLARED_ONLY:"Déclarée seulement",DISABLED:"Désactivée",HARD_DENY:"HARD_DENY",
      RESTRICTED:"RESTRICTED",CATALOG_ONLY:"Catalogue seulement",PENDING:"En attente",
      APPROVED:"Approuvée (journal)",REJECTED:"Rejetée",EXPIRED:"Expirée",REVOKED:"Révoquée",
      DENY:"Refusée",ALLOW:"Autorisée"};
    return names[key.replaceAll("-","_")] || String(value ?? "—");
  }
  function isState(key) {return ["state","status","level","decision"].includes(key);}
  function addText(tag,text,className) {
    const e = document.createElement(tag);
    e.textContent = String(text ?? "—");
    if(className) e.className = className;
    return e;
  }
  function navigation(container,className) {
    Object.entries(sections).forEach(([key,config]) => {
      const button = addText("button","",className);
      button.type="button";
      if(className === "nav-btn"){
        button.appendChild(addText("span",config.icon,"nav-symbol"));
        button.appendChild(addText("span",config.label));
      } else {
        button.textContent = config.icon+"  "+config.label;
      }
      button.dataset.section=key;
      button.addEventListener("click",() => selectSection(key));
      container.appendChild(button);
    });
  }
  navigation($("navigation"),"nav-btn");
  navigation($("mobileTabs"),"mobile-btn");

  function selectSection(key) {
    ui.active=key;ui.term="";ui.state="";
    $("search").value="";updateStatusFilter();
    render();
  }
  function updateStatusFilter(){
    const select=$("statusFilter");
    select.replaceChildren(new Option("Tous les états",""));
    const values = new Set((ui.data[ui.active]?.items || []).map((item) =>
      String(item.state || item.status || item.level || item.decision || "")).filter(Boolean));
    [...values].sort().forEach((val) => select.add(new Option(labelState(val),val)));
    select.value="";
    select.disabled=!values.size;
  }
  function metric(key,text){
    $(key).textContent=String(text);
  }
  function updateMetrics(){
    const perms=ui.data.permissions?.items || [];
    const requests=ui.data.requests?.items || [];
    const skills=ui.data.skills?.items || [];
    metric("metricPerms",perms.length);
    metric("metricRequests",requests.filter(x=>x.status==="PENDING").length);
    metric("metricSkills",skills.length);
    metric("metricGrants",0);
  }
  function statusClass(value){
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g,"-");
  }
  function format(key,value){
    if(value===null||value===undefined||value==="")return "—";
    if((key==="created_at_utc"||key==="timestamp_utc"||key==="timestamp"||key==="observed_at_utc"||key==="expires_at") && typeof value==="string" && value.includes("T")){
      const date=new Date(value);if(!Number.isNaN(date.getTime()))return date.toLocaleString("fr-FR",{dateStyle:"short",timeStyle:"medium",timeZone:"UTC"});
    }
    return String(value);
  }
  function recordDetails(item){
    const detail=$("recordDialog");
    const content=$("dialogRows");
    content.replaceChildren();
    $("dialogType").textContent=sections[ui.active].label.toUpperCase()+" / INSPECTOR";
    $("dialogTitle").textContent=String(item.action||item.name||item.id||"Détail de l'enregistrement");
    Object.entries(item).forEach(([key,value])=>{
      if(value===undefined||value===null) return;
      const line=document.createElement("div");line.className="dialog-kv";
      line.appendChild(addText("span",key.replaceAll("_"," ").toUpperCase()));
      line.appendChild(addText("span",String(value)));
      content.appendChild(line);
    });
    $("proposalEditor").hidden=!["soul","memory"].includes(ui.active);
    $("proposalText").value="";
    $("proposalStatus").textContent="Brouillon local : rien n'est envoyé ni enregistré côté serveur.";
    ui.selected=item;
    if(!content.children.length)content.appendChild(addText("p","Aucune donnée"));
    if(typeof detail.showModal==="function") detail.showModal();
  }
  function render(){
    const config=sections[ui.active],dataset=ui.data[ui.active]||{items:[],status:"unavailable"};
    document.querySelectorAll("[data-section]").forEach(el=>{
      if(el.dataset.section===ui.active)el.setAttribute("aria-current","page");
      else el.removeAttribute("aria-current");
    });
    $("sectionHeading").textContent=config.label;
    $("sectionIcon").textContent=config.icon;
    $("footerNote").textContent=config.note;
    $("sourceLabel").textContent="SOURCE : "+String(dataset.status).replaceAll("_"," ").toUpperCase();
    const head=$("dataHead"),body=$("dataBody");
    head.replaceChildren();body.replaceChildren();
    const tr=document.createElement("tr");
    config.columns.forEach(([key,label])=>tr.appendChild(addText("th",label)));
    head.appendChild(tr);
    const records=(dataset.items||[]).filter(item=>{
      const search=Object.values(item).join(" ").toLocaleLowerCase("fr");
      const state=String(item.state||item.status||item.level||item.decision||"");
      return search.includes(ui.term) && (!ui.state||state===ui.state);
    });
    records.forEach(item=>{
      const row=document.createElement("tr");row.tabIndex=0;row.setAttribute("aria-label","Voir les détails");
      config.columns.forEach(([key])=>{
        const cell=document.createElement("td"),value=format(key,item[key]);
        if(isState(key))cell.appendChild(addText("span",labelState(value),"tag "+statusClass(item[key])));
        else cell.appendChild(addText("span",key==="content"?value.slice(0,110):value,key==="action"?"action-cell":""));
        cell.title=String(value);
        row.appendChild(cell);
      });
      row.addEventListener("click",()=>recordDetails(item));
      row.addEventListener("keydown",(event)=>{
        if(event.key==="Enter"||event.key===" "){event.preventDefault();recordDetails(item);}
      });
      body.appendChild(row);
    });
    if(!records.length){
      const row=document.createElement("tr");row.className="empty-row";
      const cell=addText("td",dataset.status==="not_configured"?"Source non configurée sur GEN-1":dataset.status==="unavailable"?"Source indisponible / vérifier le service":"Aucun élément correspondant aux filtres");
      cell.colSpan=config.columns.length;row.appendChild(cell);body.appendChild(row);
    }
    $("itemCount").textContent=records.length+" élément"+(records.length>1?"s":"");
    updateMetrics();
  }
  async function load(){
    $("refreshBtn").disabled=true;
    try{
      if(demo){
        ui.data=Object.fromEntries(Object.keys(sections).map(k=>[k,{status:"offline",items:[]}]));
        $("modeBadge").textContent="PREVIEW / OFFLINE";
        $("modeBadge").classList.remove("connected");
        $("connectionMode").textContent="MAQUETTE HTML";
        $("noticeText").textContent="Aperçu hors ligne sans événements simulés. Connectez le backend pour consulter les sources.";
      }else{
        const keys=Object.keys(sections);
        const results=await Promise.all(keys.map(async (key)=>{
          const response=await fetch("/api/"+key,{cache:"no-store",credentials:"same-origin"});
          if(!response.ok)return [key,{status:"unavailable",items:[]}];
          return [key,await response.json()];
        }));
        ui.data=Object.fromEntries(results);
        $("modeBadge").textContent="ADMIN · READ ONLY";
        $("modeBadge").classList.add("connected");
        $("connectionMode").textContent="LOOPBACK / AUTH ADMIN";
        $("noticeText").textContent="API de consultation connectée. Exécution, déploiement et approbations désactivés.";
      }
    }catch(err){
      ui.data=Object.fromEntries(Object.keys(sections).map(k=>[k,{items:[],status:"unavailable"}]));
      $("modeBadge").textContent="API UNAVAILABLE";
      $("modeBadge").classList.remove("connected");
      $("connectionMode").textContent="ERREUR DE CONNEXION";
      $("noticeText").textContent="Impossible de charger les sources. Aucun jeu de démonstration substitué à des données réelles.";
      console.warn("Admin console: source unavailable",String(err).slice(0,90));
    }finally{
      $("refreshBtn").disabled=false;
      updateStatusFilter();render();
    }
  }
  $("search").addEventListener("input",event=>{
    ui.term=event.target.value.trim().toLocaleLowerCase("fr");render();
  });
  $("statusFilter").addEventListener("change",event=>{ui.state=event.target.value;render();});
  $("refreshBtn").addEventListener("click",load);
  $("closeDialog").addEventListener("click",()=>$("recordDialog").close());
  $("recordDialog").addEventListener("click",(event)=>{
    if(event.target===$("recordDialog"))$("recordDialog").close();
  });
  $("copyProposal").addEventListener("click", async ()=>{
    const content=$("proposalText").value.trim();
    if(!content || content.length>12000){$("proposalStatus").textContent="Proposition requise, maximum 12 000 caractères.";return;}
    const draft={kind:ui.active,reference:ui.selected?.name||ui.selected?.id,
      base_content:ui.selected?.content||ui.selected?.summary,proposal:content,
      workflow:"GitHub PR → CI → approbation indépendante",status:"DRAFT_NOT_SUBMITTED"};
    try{await navigator.clipboard.writeText(JSON.stringify(draft,null,2));$("proposalStatus").textContent="Brouillon copié. À joindre à une PR GitHub ; aucune modification appliquée.";}
    catch{ $("proposalStatus").textContent="Presse-papiers indisponible. Sélectionnez et copiez le texte manuellement.";}
  });
  load();
})();
