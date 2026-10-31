'use strict';
(function(global){
 var helpTimer=null,helpNode=null;
 var S={wallets:[],walletId:'',network:'ethereum',coin:null,coinResolved:null,cryptoAmount:'',fiatAmount:'',fiat:'EUR',preview:null,busy:false,error:'',human:false,catalogPage:1,catalogQuery:'',catalogBusy:false,price:null,nativePrice:null,timer:null};
 var NETS=['bitcoin','ethereum','arbitrum','polygon','bnb','base','solana'];
 var NATIVE={bitcoin:'bitcoin',ethereum:'ethereum',arbitrum:'ethereum',polygon:'polygon-ecosystem-token',bnb:'binancecoin',base:'ethereum',solana:'solana'};
 var NETLABEL={bitcoin:'Bitcoin',ethereum:'Ethereum',arbitrum:'Arbitrum',polygon:'Polygon',bnb:'BNB Chain',base:'Base',solana:'Solana'};
 var NETLOGO={
  bitcoin:'https://cryptologos.cc/logos/bitcoin-btc-logo.png?v=040',
  ethereum:'https://cryptologos.cc/logos/ethereum-eth-logo.png?v=040',
  arbitrum:'https://cryptologos.cc/logos/arbitrum-arb-logo.png?v=040',
  polygon:'https://cryptologos.cc/logos/polygon-matic-logo.png?v=040',
  bnb:'https://cryptologos.cc/logos/bnb-bnb-logo.png?v=040',
  base:'https://cryptologos.cc/logos/base-logo.png?v=040',
  solana:'https://cryptologos.cc/logos/solana-sol-logo.png?v=040'
 };
 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
 function api(url,opt){opt=opt||{};var o={method:opt.method||'GET',headers:{Accept:'application/json'}};if(opt.body!==undefined){o.headers['Content-Type']='application/json';o.body=JSON.stringify(opt.body)}return fetch(url,o).then(function(r){return r.json().catch(function(){return{}}).then(function(x){if(!r.ok||x.ok===false)throw new Error(x.error||('HTTP '+r.status));return x})})}
 function marketRead(action,args){return fetch('/communication/v1/ui/read',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({target:'marketdata',action:action,arguments:args||{}}),cache:'no-store'}).then(function(r){return r.json().then(function(o){if(!r.ok||o.error)throw new Error(o.error||('HTTP '+r.status));return o.data||{}})})}
 function walletNetworks(w){return (w&&w.networks||[]).filter(function(n){return NETS.indexOf(n)>=0})}
 function selectedWallet(){return S.wallets.filter(function(w){return String(w.id)===String(S.walletId)})[0]||null}

 function detectInternalAddress(addr){addr=String(addr||'');var exact=S.network==='bitcoin'||S.network==='solana';for(var i=0;i<S.wallets.length;i++){var w=S.wallets[i],ac=w.accounts||[];for(var j=0;j<ac.length;j++){var a=String(ac[j].address||'');if((exact?a===addr:a.toLowerCase()===addr.toLowerCase()))return{wallet:w,account:ac[j]}}}return null}
 function iconWallet(){return '<svg viewBox="0 0 24 24"><path d="M4 6.5h13.5A2.5 2.5 0 0 1 20 9v9H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h11v2.5"/><path d="M15.5 11.5H21v4h-5.5a2 2 0 0 1 0-4Z"/><path d="M8 11v5M5.5 13.5h5"/></svg>'}
 function iconSend(){return '<svg viewBox="0 0 24 24"><path d="M3 11.5 21 3l-6.5 18-3.2-7.2L3 11.5Z"/><path d="M11.3 13.8 21 3"/></svg>'}
 function decorateTitles(){
  var root=document.getElementById('walletManager');if(!root)return;
  var boxes=root.querySelectorAll('.wvSideBox');
  if(boxes[0]){var h=boxes[0].querySelector('h3');if(h)h.innerHTML='<span class="wvModuleTitleIcon">'+iconWallet()+'</span><span>Nouveau Porte-Feuille</span>'}
 }
 function coinButton(){
  var c=S.coin||{symbol:'--',name:'Choisir une crypto',image:''};
  return '<button type="button" id="btcCoinPick" aria-labelledby="btcCryptoLabel" class="btcCoinPick" data-help="Cliquez pour ouvrir le catalogue CoinGecko. La crypto choisie est ensuite vérifiée sur le réseau du wallet.">'+(c.image?'<img src="'+esc(c.image)+'" alt="">':'<span class="btcCoinFallback">◈</span>')+'<span><b>'+esc(c.symbol||'--')+'</b><small>'+esc(c.name||'Choisir une crypto')+'</small></span><i>⌄</i></button>';
 }
 function networkBadge(){
  return '<div class="btcNetworkRow"><span>Réseau</span><button type="button" id="btcNetworkBtn" class="btcNetworkBtn" data-help="Le réseau est déterminé par le wallet source et la crypto choisie. Cliquez pour changer si plusieurs réseaux sont compatibles."><img src="'+esc(NETLOGO[S.network]||'')+'" alt=""><b>'+esc(NETLABEL[S.network]||S.network)+'</b><i>✓</i></button><span id="btcNetCheck" class="btcNetCheck">'+(S.preview&&S.preview.networkMatch?'Compatible':'À vérifier')+'</span></div>';
 }
 function amountBox(){
  var sym=S.coin&&S.coin.symbol||'CRYPTO',fiat=S.fiat;
  return '<div class="btcAmounts"><label data-help="Saisissez le montant en crypto. La valeur fiat est recalculée automatiquement."><span>Montant crypto</span><div class="btcAmountInput"><input id="btcCryptoAmount" inputmode="decimal" placeholder="0.00" value="'+esc(S.cryptoAmount)+'"><b>'+esc(sym)+'</b></div></label><label data-help="Vous pouvez aussi saisir directement une valeur fiat. Cliquez sur EUR/USD pour changer de devise."><span>Valeur fiat</span><div class="btcAmountInput fiat"><input id="btcFiatAmount" inputmode="decimal" placeholder="0.00" value="'+esc(S.fiatAmount)+'"><button type="button" id="btcFiatToggle">'+fiat+'</button></div></label></div>';
 }

 function gasBox(){
  var label=S.preview&&S.preview.feeLabel||'Frais réseau estimés';
  if(S.busy)return '<div class="btcGas wait">◷ Calcul du solde et des frais réseau…</div>';
  if(!S.preview)return '<div class="btcGas">'+esc(label)+' : <b>--</b></div>';
  var gas=+S.preview.gasCostNative||0,fiatPrice=S.nativePrice&&(S.fiat==='EUR'?S.nativePrice.priceEUR:S.nativePrice.priceUSD),fiat=gas&&fiatPrice?gas*fiatPrice:null;
  return '<div class="btcGas"><span>'+esc(label)+'</span><b>'+esc(S.preview.gasCostNative||'--')+' '+esc(S.preview.nativeSymbol||'')+(fiat!=null?' · '+fiat.toFixed(2)+' '+S.fiat:'')+'</b></div>';
 }

 function checks(){
  if(S.error)return '<div class="btcCheck bad">✕ '+esc(S.error)+'</div>';
  if(!S.preview)return '<div class="btcCheck">Adresse, actif, montant et frais réseau vérifiés avant signature.</div>';
  if(!S.preview.canTransfer){var m=!S.preview.enoughAsset?'Solde crypto insuffisant.':!S.preview.enoughGas?'Solde natif insuffisant pour les frais réseau.':'Transfert non disponible.';return '<div class="btcCheck bad">✕ '+esc(m)+'</div>'}
  return '<div class="btcCheck ok">✓ Adresse valide · réseau compatible · solde et frais suffisants</div>';
 }
 function render(){
  var box=document.getElementById('wvTransfer');if(!box)return;
  box.classList.add('btcTransferCompact');
  var ws=S.wallets.map(function(w){return'<option value="'+esc(w.id)+'" '+(String(w.id)===String(S.walletId)?'selected':'')+'>'+esc(w.name)+' · ID '+esc(w.id)+'</option>'}).join('');
  box.innerHTML='<h3><span class="wvModuleTitleIcon">'+iconSend()+'</span><span>Transférer</span></h3>'+
   '<label class="btcField" data-help="Choisissez le wallet IA-TB qui sera débité."><span>Wallet source</span><select id="btcWallet">'+ws+'</select></label>'+
   '<label class="btcField" data-help="Adresse publique du destinataire. IA-TB valide son format avant tout calcul de frais."><span>Adresse de réception</span><input id="btcAddress" autocomplete="off" spellcheck="false" placeholder="'+esc(S.network==='bitcoin'?'bc1… / 1… / 3…':S.network==='solana'?'Adresse Solana':'0x…')+'" value="'+esc(S.destinationAddress||'')+'"></label>'+
   networkBadge()+
   '<div class="btcField btcCryptoField"><span id="btcCryptoLabel">Crypto</span>'+coinButton()+'</div>'+
   amountBox()+gasBox()+checks()+
   '<label class="btcHuman" data-help="Cette confirmation est obligatoire côté interface ET côté serveur avant la signature."><input id="btcHuman" type="checkbox" '+(S.human?'checked':'')+'><span>Je ne suis pas un robot</span></label>'+
   '<button class="wvPrimary btcSend" id="btcSend" data-help="Le transfert reste bloqué tant que adresse, réseau, solde, frais réseau et anti-robot ne sont pas validés." '+(!(S.preview&&S.preview.canTransfer&&S.human)||S.busy?'disabled':'')+'>Transférer</button>'+
   '<div id="btcPicker" class="btcPicker" hidden><div class="btcPickerHead"><input id="btcCoinSearch" placeholder="Rechercher une crypto…" autocomplete="off"><button id="btcPickerClose" type="button">×</button></div><div id="btcCoinList" class="btcCoinList"></div><button id="btcMore" class="btcMore" type="button">Afficher plus</button></div>';
  bind();
 }
 function loadWallets(){
  return api('/api/security/wallets').then(function(o){S.wallets=(o.items||[]).filter(function(w){return w.source!=='CONNECTOR'&&w.source!=='WALLETCONNECT'});if(!S.walletId&&S.wallets[0])S.walletId=S.wallets[0].id;var w=selectedWallet(),nets=walletNetworks(w);if(nets.indexOf(S.network)<0&&nets[0])S.network=nets[0];decorateTitles();render();return o}).catch(function(e){S.error=e.message;render()});
 }
 function loadCatalog(reset){
  if(S.catalogBusy)return;S.catalogBusy=true;if(reset)S.catalogPage=1;
  var list=document.getElementById('btcCoinList');if(reset&&list)list.innerHTML='<div class="btcLoading">Chargement CoinGecko…</div>';
  var q=S.catalogQuery;
  marketRead('marketdata.catalog',{query:q,page:S.catalogPage,perPage:50}).then(function(o){list=document.getElementById('btcCoinList');if(!list)return;if(reset)list.innerHTML='';(o.items||[]).forEach(function(c){var b=document.createElement('button');b.type='button';b.className='btcCoinRow';b.innerHTML=(c.image?'<img src="'+esc(c.image)+'" alt="">':'<span class="btcCoinFallback">◈</span>')+'<span><b>'+esc(c.name)+'</b><small>'+esc(c.symbol)+' · '+(c.priceEUR==null?'--':Number(c.priceEUR).toLocaleString(undefined,{maximumFractionDigits:8}))+' €</small></span>';b.onclick=function(){chooseCoin(c)};list.appendChild(b)});var more=document.getElementById('btcMore');if(more)more.style.display=o.hasMore&&!q?'block':'none';S.catalogPage++;}).catch(function(e){if(list)list.innerHTML='<div class="btcLoading bad">'+esc(e.message)+'</div>'}).then(function(){S.catalogBusy=false});
 }

 function resolveOnNetworks(c){
  var w=selectedWallet(),nets=walletNetworks(w);if(!nets.length)return Promise.reject(new Error('Aucun réseau de transfert disponible sur ce wallet.'));
  var preferred=c&&c.id==='bitcoin'?'bitcoin':c&&c.id==='solana'?'solana':S.network,order=[];
  [preferred,S.network].concat(nets).forEach(function(n){if(nets.indexOf(n)>=0&&order.indexOf(n)<0)order.push(n)});
  var i=0;
  function next(last){if(i>=order.length)return Promise.reject(last||new Error('Cette crypto n’est pas disponible sur les réseaux autorisés du wallet.'));var n=order[i++];return marketRead('marketdata.asset.resolve',{id:c.id,network:n}).then(function(o){if(!o.transferable)throw new Error('ASSET_NOT_ON_NETWORK');S.network=n;return o}).catch(next)}
  return next();
 }
 function chooseCoin(c){
  S.coin=c;S.preview=null;S.error='';var p=document.getElementById('btcPicker');if(p)p.hidden=true;
  resolveOnNetworks(c).then(function(o){S.coinResolved=o;S.price={priceEUR:o.priceEUR,priceUSD:o.priceUSD};syncFiatFromCrypto();return loadNativePrice()}).then(function(){render();schedulePreview()}).catch(function(e){S.coinResolved=null;S.error='Crypto indisponible sur les réseaux autorisés de ce wallet.';render()});
 }
 function loadNativePrice(){return marketRead('marketdata.asset.resolve',{id:NATIVE[S.network],network:S.network}).then(function(o){S.nativePrice=o}).catch(function(){S.nativePrice=null})}
 function syncFiatFromCrypto(){var a=+S.cryptoAmount,p=S.price&&(S.fiat==='EUR'?S.price.priceEUR:S.price.priceUSD);S.fiatAmount=a>0&&p?String(Math.round(a*p*100)/100):''}
 function syncCryptoFromFiat(){var a=+S.fiatAmount,p=S.price&&(S.fiat==='EUR'?S.price.priceEUR:S.price.priceUSD);S.cryptoAmount=a>0&&p?String(a/p):''}

 function previewPayload(){
  var r=S.coinResolved;if(!r)return null;var known=detectInternalAddress(S.destinationAddress),asset=S.network==='bitcoin'?'BTC':S.network==='solana'?'SOL':(r.isNative?'NATIVE':'ERC20');
  return{sourceWalletId:S.walletId,sourceNetwork:S.network,destinationNetwork:S.network,destinationWalletId:known&&known.wallet?known.wallet.id:'',destinationAddress:S.destinationAddress,asset:asset,tokenAddress:r.tokenAddress||'',tokenSymbol:r.symbol||S.coin.symbol,coinId:r.id,amount:S.cryptoAmount};
 }
 function schedulePreview(){clearTimeout(S.timer);S.preview=null;S.error='';if(!S.destinationAddress||!S.coinResolved||!(+S.cryptoAmount>0)){render();return}S.timer=setTimeout(runPreview,450)}
 function runPreview(){
  var p=previewPayload();if(!p)return;S.busy=true;render();api('/api/transfers/preview',{method:'POST',body:p}).then(function(o){S.preview=o;S.error='';var known=detectInternalAddress(S.destinationAddress);if(known&&known.wallet)S.preview.destinationWalletId=known.wallet.id;return loadNativePrice()}).catch(function(e){S.preview=null;S.error=e.message}).then(function(){S.busy=false;render()});
 }
 function confirmSend(){
  if(!(S.preview&&S.preview.canTransfer&&S.human))return;
  var id='btcPw'+Date.now(),html='<div class="wvTransferConfirm"><div><small>RÉSEAU</small><b>'+esc(S.preview.networkName||S.network)+'</b></div><div><small>MONTANT</small><b>'+esc(S.preview.amount)+' '+esc(S.preview.symbol)+'</b></div><div><small>FRAIS</small><b>'+esc(S.preview.gasCostNative)+' '+esc(S.preview.nativeSymbol||'')+'</b></div><div class="wide"><small>VERS</small><code>'+esc(S.preview.destinationAddress)+'</code></div><label class="wide">Mot de passe du wallet<input id="'+id+'" type="password" autocomplete="current-password"></label></div>';
  var n=global.IATBNotify;if(n&&n.show)n.show({size:'large',modal:true,icon:'⇄',title:'Confirmer le transfert',subtitle:'Signature on-chain après vérification finale',html:html,actions:[{label:'Annuler'},{label:'Signer et transférer',kind:'primary',onClick:function(close){var e=document.getElementById(id),pw=e&&e.value||'';if(!pw){if(e)e.focus();return}close();execute(pw)}}]});else{var pw=prompt('Mot de passe du wallet');if(pw)execute(pw)}
 }

 function execute(password){
  S.busy=true;render();api('/api/transfers/execute',{method:'POST',body:{previewId:S.preview.previewId,password:password,confirmed:true,humanConfirmed:S.human}}).then(function(o){
   S.cryptoAmount='';S.fiatAmount='';S.preview=null;S.human=false;S.error='';
   if(o.status==='CONFIRMED'&&global.IATBNotify&&IATBNotify.transferSuccess)IATBNotify.transferSuccess({direction:'OUT',timestamp:o.timestamp,network:o.network,symbol:o.symbol,amount:o.amount,sourceAddress:o.sourceAddress,destinationAddress:o.destinationAddress,tx:o.txHash});
   else if(global.IATBNotify&&IATBNotify.show)IATBNotify.show({size:'medium',icon:'⇄',title:'Transfert soumis',subtitle:'Confirmation réseau en attente',html:'<div class="wvTransferConfirm"><div><small>RÉSEAU</small><b>'+esc(o.networkName||o.network)+'</b></div><div><small>MONTANT</small><b>'+esc(o.amount)+' '+esc(o.symbol)+'</b></div><div class="wide"><small>TRANSACTION</small><code>'+esc(o.txHash||'')+'</code></div></div>'});
   render();
  }).catch(function(e){S.error=e.message;render()}).then(function(){S.busy=false;render()});
 }
 function bind(){
  var w=document.getElementById('btcWallet'),a=document.getElementById('btcAddress'),coin=document.getElementById('btcCoinPick'),search=document.getElementById('btcCoinSearch'),close=document.getElementById('btcPickerClose'),more=document.getElementById('btcMore'),ca=document.getElementById('btcCryptoAmount'),fa=document.getElementById('btcFiatAmount'),ft=document.getElementById('btcFiatToggle'),human=document.getElementById('btcHuman'),send=document.getElementById('btcSend'),net=document.getElementById('btcNetworkBtn');
  if(w)w.onchange=function(){S.walletId=this.value;var nets=walletNetworks(selectedWallet());if(nets.indexOf(S.network)<0&&nets[0])S.network=nets[0];S.coinResolved=null;S.preview=null;render()};
  if(a)a.oninput=function(){S.destinationAddress=this.value.trim();schedulePreview()};
  if(coin)coin.onclick=function(){var p=document.getElementById('btcPicker');if(p){p.hidden=false;S.catalogQuery='';S.catalogPage=1;loadCatalog(true);setTimeout(function(){var s=document.getElementById('btcCoinSearch');if(s)s.focus()},0)}};
  if(close)close.onclick=function(){document.getElementById('btcPicker').hidden=true};
  if(search)search.oninput=function(){clearTimeout(search.__t);var self=this;search.__t=setTimeout(function(){S.catalogQuery=self.value.trim();loadCatalog(true)},300)};
  if(more)more.onclick=function(){loadCatalog(false)};
  if(ca)ca.oninput=function(){S.cryptoAmount=this.value.replace(',','.');syncFiatFromCrypto();var x=document.getElementById('btcFiatAmount');if(x)x.value=S.fiatAmount;schedulePreview()};
  if(fa)fa.oninput=function(){S.fiatAmount=this.value.replace(',','.');syncCryptoFromFiat();var x=document.getElementById('btcCryptoAmount');if(x)x.value=S.cryptoAmount;schedulePreview()};
  if(ft)ft.onclick=function(){S.fiat=S.fiat==='EUR'?'USD':'EUR';syncFiatFromCrypto();render()};
  if(human)human.onchange=function(){S.human=this.checked;var b=document.getElementById('btcSend');if(b)b.disabled=!(S.preview&&S.preview.canTransfer&&S.human)||S.busy};
  if(send)send.onclick=confirmSend;
  if(net)net.onclick=function(){var w=selectedWallet(),nets=walletNetworks(w);if(nets.length<2)return;var i=nets.indexOf(S.network);S.network=nets[(i+1)%nets.length];S.coinResolved=null;S.preview=null;if(S.coin)chooseCoin(S.coin);else render()};
  mountHelp();
 }
 function removeHelp(){if(helpNode&&helpNode.parentNode)helpNode.parentNode.removeChild(helpNode);helpNode=null}
 function mountHelp(){
  [].slice.call(document.querySelectorAll('#wvTransfer [data-help]')).forEach(function(el){
   if(el.__compactHelp)return;el.__compactHelp=1;
   el.addEventListener('mouseenter',function(){clearTimeout(helpTimer);helpTimer=setTimeout(function(){removeHelp();var r=el.getBoundingClientRect(),n=document.createElement('div');n.className='wvHelpBubble';n.textContent=el.getAttribute('data-help')||'';document.body.appendChild(n);var left=Math.max(8,Math.min(window.innerWidth-n.offsetWidth-8,r.left+r.width/2-n.offsetWidth/2)),top=Math.max(8,r.top-n.offsetHeight-8);n.style.left=left+'px';n.style.top=top+'px';helpNode=n},2000)});
   el.addEventListener('mouseleave',function(){clearTimeout(helpTimer);removeHelp()});
  });
 }
 function mount(){
  var host=document.getElementById('walletManager');if(!host)return;
  decorateTitles();loadWallets();
  var mo=new MutationObserver(function(){var t=document.getElementById('wvTransfer');if(t&&!t.classList.contains('btcTransferCompact')){decorateTitles();render()}});
  mo.observe(host,{childList:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})(window);