(function(){'use strict';function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}function show(o){o=o||{};var size=['small','medium','large','xlarge'].indexOf(o.size)>=0?o.size:'small',layer=document.createElement('div');layer.className='iaNtfLayer '+(o.modal!==false?'hasModal':'');var actions=(o.actions||[]).map(function(a,i){return '<button data-a="'+i+'" class="'+esc(a.kind||'')+'">'+esc(a.label||'OK')+'</button>'}).join('');layer.innerHTML='<section class="iaNtf '+size+'"><header class="iaNtfHead"><span class="iaNtfIcon">'+esc(o.icon||'✦')+'</span><div><b>'+esc(o.title||'IA-TB')+'</b><small>'+esc(o.subtitle||'Notification sécurisée')+'</small></div><button class="iaNtfClose">×</button></header><div class="iaNtfBody">'+(o.html||esc(o.text||''))+(o.image?'<img src="'+esc(o.image)+'" alt="">':'')+'</div>'+(actions?'<footer class="iaNtfActions">'+actions+'</footer>':'')+'</section>';document.body.appendChild(layer);function close(){if(layer.parentNode)layer.parentNode.removeChild(layer);if(o.onClose)o.onClose()}layer.querySelector('.iaNtfClose').onclick=close;[].slice.call(layer.querySelectorAll('[data-a]')).forEach(function(b){b.onclick=function(){var a=o.actions[+b.getAttribute('data-a')];if(a&&a.onClick)a.onClick(close);else close()}});return{close:close,element:layer}}function txLogo(symbol){
 symbol=String(symbol||'').toUpperCase();
 var map={
  BTC:'https://cryptologos.cc/logos/bitcoin-btc-logo.png?v=040',
  ETH:'https://cryptologos.cc/logos/ethereum-eth-logo.png?v=040',
  USDC:'https://cryptologos.cc/logos/usd-coin-usdc-logo.png?v=040',
  USDT:'https://cryptologos.cc/logos/tether-usdt-logo.png?v=040',
  SOL:'https://cryptologos.cc/logos/solana-sol-logo.png?v=040',
  BNB:'https://cryptologos.cc/logos/bnb-bnb-logo.png?v=040',
  POL:'https://cryptologos.cc/logos/polygon-matic-logo.png?v=040'
 };
 return map[symbol]||'';
}
function txDate(ts){
 var d=new Date(ts||Date.now()),p=function(n){return(n<10?'0':'')+n;};
 return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+String(d.getFullYear()).slice(-2);
}
function smartContractSuccess(o){
 o=o||{};
 var fromSymbol=String(o.fromSymbol||'').toUpperCase(),toSymbol=String(o.toSymbol||'').toUpperCase(),
     fromLogo=txLogo(fromSymbol),toLogo=txLogo(toSymbol),
     tx=String(o.tx||o.txHash||'--'),
     totalFee=o.totalFeeLabel?String(o.totalFeeLabel):((o.totalFeeEUR===null||o.totalFeeEUR===undefined||o.totalFeeEUR==='')?'--':String(o.totalFeeEUR)+' €'),
     gas=o.gasFeeLabel?String(o.gasFeeLabel):((o.gasFeeEUR===null||o.gasFeeEUR===undefined||o.gasFeeEUR==='')?'--':String(o.gasFeeEUR)+' €'),
     iatb=o.iatbFeeLabel?String(o.iatbFeeLabel):((o.iatbFeeEUR===null||o.iatbFeeEUR===undefined||o.iatbFeeEUR==='')?'--':String(o.iatbFeeEUR)+' €'),
     html='<div class="iaScSuccess">'+
      '<div class="iaScBadge">✓ SMART CONTRACT CONFIRMÉ</div>'+
      '<div class="iaTxFlow iaScFlow">'+
       '<span class="iaTxDate">'+esc(txDate(o.timestamp))+' :</span>'+
       '<span class="iaTxAsset">'+(fromLogo?'<img src="'+esc(fromLogo)+'" alt="">':'')+'<b>'+esc(o.fromAmount||'--')+'</b><small>'+esc(fromSymbol)+'</small></span>'+
       '<span class="iaTxArrow">→</span>'+
       '<span class="iaTxAsset">'+(toLogo?'<img src="'+esc(toLogo)+'" alt="">':'')+'<b>'+esc(o.toAmount||'--')+'</b><small>'+esc(toSymbol)+'</small></span>'+
       '<span class="iaTxFee">− '+esc(totalFee)+'</span>'+
      '</div>'+
      '<div class="iaScGrid">'+
       '<div><small>TYPE</small><b>'+esc(o.operation||'Swap / Bridge')+'</b></div>'+
       '<div><small>RÉSEAU</small><b>'+esc(o.network||'--')+'</b></div>'+
       '<div><small>PROVIDER</small><b>'+esc(o.provider||'--')+'</b></div>'+
       '<div><small>GAS</small><b>'+esc(gas)+'</b></div>'+
       '<div><small>FRAIS IA-TB</small><b>'+esc(iatb)+' · 1 %</b></div>'+
       '<div><small>STATUT</small><b class="iaScOk">'+esc(o.status||'Confirmée')+'</b></div>'+
      '</div>'+
      '<div class="iaTxHash iaScHash"><b>TX :</b> <span>'+esc(tx)+'</span></div>'+
     '</div>';
 return show({size:'xlarge',modal:false,icon:'✓',title:o.title||'Transaction Smart Contract réussie',subtitle:o.subtitle||'Signature et confirmation on-chain validées',html:html});
}
function smartContractSignature(o){
 o=o||{};
 var tx=String(o.tx||o.txHash||'En attente de signature'),
     fromSymbol=String(o.fromSymbol||'').toUpperCase(),
     toSymbol=String(o.toSymbol||'').toUpperCase(),
     feeIATB=(o.iatbFeePct==null?'1':String(o.iatbFeePct)),
     rows=[
      ['Réseau',o.network||'--'],
      ['Smart contract',o.contract||'--'],
      ['Action',o.action||'Signature de contrat'],
      ['Provider / Route',o.provider||'--'],
      ['Actif envoyé',(o.fromAmount||'--')+' '+fromSymbol],
      ['Actif estimé reçu',(o.toAmount||'--')+' '+toSymbol],
      ['Gas estimé',o.gasCost||'--'],
      ['Frais provider',o.providerFee||'--'],
      ['Frais IA-TB',feeIATB+' %'+(o.iatbFeeAmount?' · '+o.iatbFeeAmount:'')],
      ['Coût total',o.totalCost||'--'],
      ['TX',tx]
     ],
     html='<div class="iaContractSign">'+
      '<div class="iaContractWarning"><b>Signature de smart contract</b><span>Vérifiez chaque donnée avant de signer. IA-TB ne doit jamais envoyer la transaction avant votre confirmation.</span></div>'+
      '<div class="iaContractRows">'+rows.map(function(r){return '<div><span>'+esc(r[0])+'</span><b>'+esc(r[1])+'</b></div>'}).join('')+'</div>'+
      '<div class="iaContractFlow"><span>'+esc(fromSymbol||'ACTIF')+'</span><strong>'+esc(o.fromAmount||'--')+'</strong><i>→</i><span>'+esc(toSymbol||'ACTIF')+'</span><strong>'+esc(o.toAmount||'--')+'</strong></div>'+
     '</div>';
 return show({
  size:'xlarge',
  modal:true,
  icon:'✍',
  title:o.title||'Signature Smart Contract',
  subtitle:o.subtitle||'Confirmation obligatoire avant envoi on-chain',
  html:html,
  actions:[
   {label:'Annuler',kind:'',onClick:function(close){close();if(o.onCancel)o.onCancel();}},
   {label:o.confirmLabel||'Vérifier et signer',kind:'primary',onClick:function(close){if(o.onConfirm)o.onConfirm(close);}}
  ]
 });
}
function networkLogo(network){
 network=String(network||'').toLowerCase();
 var map={
  ethereum:'https://cryptologos.cc/logos/ethereum-eth-logo.png?v=040',
  arbitrum:'https://cryptologos.cc/logos/arbitrum-arb-logo.png?v=040',
  polygon:'https://cryptologos.cc/logos/polygon-matic-logo.png?v=040',
  bnb:'https://cryptologos.cc/logos/bnb-bnb-logo.png?v=040',
  base:'https://cryptologos.cc/logos/base-logo.png?v=040',
  bitcoin:'https://cryptologos.cc/logos/bitcoin-btc-logo.png?v=040',
  solana:'https://cryptologos.cc/logos/solana-sol-logo.png?v=040'
 };
 return map[network]||'';
}
function transferSuccess(o){
 o=o||{};
 var direction=String(o.direction||'OUT').toLowerCase(),incoming=direction==='received'||direction==='in'||direction==='incoming',
     network=String(o.network||'').toLowerCase(),symbol=String(o.symbol||'').toUpperCase(),
     netLogo=networkLogo(network),assetLogo=txLogo(symbol),arrow=incoming?'←':'→',
     tx=String(o.tx||o.txHash||'--'),
     html='<div class="iaTransferSuccess">'+
      '<div class="iaTransferLine">'+
       '<span class="iaTxDate">'+esc(txDate(o.timestamp))+' :</span>'+
       '<span class="iaTransferNet">'+(netLogo?'<img src="'+esc(netLogo)+'" alt="">':'')+'<small>'+esc(network||'réseau')+'</small></span>'+
       '<span class="iaTransferDash">−</span>'+
       '<span class="iaTransferAmount"><b>'+esc(o.amount||'--')+'</b>'+(assetLogo?'<img src="'+esc(assetLogo)+'" alt="">':'')+'<small>'+esc(symbol)+'</small></span>'+
      '</div>'+
      '<div class="iaTransferAddresses"><code>'+esc(o.sourceAddress||'--')+'</code><strong>'+arrow+'</strong><code>'+esc(o.destinationAddress||'--')+'</code></div>'+
      '<div class="iaTxHash"><b>TX :</b> <span>'+esc(tx)+'</span></div>'+
     '</div>';
 return show({size:'medium',modal:false,icon:incoming?'↓':'↑',title:o.title||(incoming?'Réception crypto confirmée':'Transfert crypto confirmé'),subtitle:o.subtitle||('Réseau '+(network||'--')+' · confirmation on-chain'),html:html});
}
function transactionSuccess(o){
 o=o||{};
 var fromSymbol=String(o.fromSymbol||'').toUpperCase(),toSymbol=String(o.toSymbol||'').toUpperCase(),
     fromLogo=txLogo(fromSymbol),toLogo=txLogo(toSymbol),
     fee=(o.feeEUR===null||o.feeEUR===undefined||o.feeEUR==='')?'--':String(o.feeEUR),
     tx=String(o.tx||o.txHash||'--'),
     html='<div class="iaTxSuccess">'+
      '<div class="iaTxFlow">'+
       '<span class="iaTxDate">'+esc(txDate(o.timestamp))+' :</span>'+
       '<span class="iaTxAsset">'+(fromLogo?'<img src="'+esc(fromLogo)+'" alt="">':'')+'<b>'+esc(o.fromAmount||'--')+'</b><small>'+esc(fromSymbol)+'</small></span>'+
       '<span class="iaTxArrow">→</span>'+
       '<span class="iaTxAsset">'+(toLogo?'<img src="'+esc(toLogo)+'" alt="">':'')+'<b>'+esc(o.toAmount||'--')+'</b><small>'+esc(toSymbol)+'</small></span>'+
       '<span class="iaTxFee">− '+esc(fee)+' €</span>'+
      '</div>'+
      '<div class="iaTxHash"><b>TX :</b> <span>'+esc(tx)+'</span></div>'+
     '</div>';
 return show({size:'medium',modal:false,icon:'✓',title:o.title||'Swap / Bridge réussi',subtitle:o.subtitle||'Transaction confirmée',html:html});
}
window.IATBNotify={show:show,small:function(o){o=o||{};o.size='small';return show(o)},medium:function(o){o=o||{};o.size='medium';return show(o)},large:function(o){o=o||{};o.size='large';return show(o)},xlarge:function(o){o=o||{};o.size='xlarge';return show(o)},smartContractSignature:smartContractSignature,transactionSuccess:transactionSuccess,smartContractSuccess:smartContractSuccess,transferSuccess:transferSuccess}})();