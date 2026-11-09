function readLabel(tokens){
 const text=tokens.map(t=>t.s).join(' ').replace(/\s+/g,' ');
 const numberText=text.replace(/R\$/g,' ');
 const priceFor=marker=>{
  const match=numberText.match(new RegExp('\\b'+marker+'\\s*:\\s*(\\d+)\\s*,\\s*(\\d{2})(?!\\d)','i'));
  return match?match[1]+','+match[2]:'';
 };
 const endMatch=text.match(/(?:\bAT[ÉE]|VENCIMENTO\s+EM\s*:)\s*(\d{2}\/\d{2}\/\d{4})/i);
 const startMatch=text.match(/(?:V[ÁA]LIDO\s+DE|VALIDADE\s*:)\s*(\d{2}\/\d{2}\/\d{4})/i);
 const printedMatch=[...text.matchAll(/\d{2}\/\d{2}\/\d{4}/g)].find(m=>
  ![startMatch,endMatch].some(range=>range&&m.index>=range.index&&m.index<range.index+range[0].length));
 const beforePrice=tokens.slice(0,tokens.findIndex(t=>/^DE\s*:$/.test(t.s)));
 const name=beforePrice.filter(t=>!/^DESCONTO$/i.test(t.s)&&!/CLUBZ|EXCLUSIVO|PARA MEMBROS/i.test(t.s)).map(t=>t.s).join(' ').trim();
 return {
  name,ean:text.match(/\bEAN\s*:?\s*(\d{8,14})\b/i)?.[1]||'',
  end:dateBR(endMatch?.[1]),start:dateBR(startMatch?.[1]),printed:dateBR(printedMatch?.[0]),
  price:priceFor('POR'),original:priceFor('DE'),
  condition:/CLUBZ/i.test(text)?'Exclusivo para membros Clubz':'',
  notes:/ENQUANTO\s+DURAREM\s+OS\s+ESTOQUES/i.test(text)?'Enquanto durarem os estoques':'',
  band:text.match(/\bF[123]\b/)?.[0]||'',
  location:text.match(/\bF:\s*\d+\s+E:\s*\d+/)?.[0]||'',
  model:/VENCIMENTO\s+EM/i.test(text)?'Markdown':'Fidelizado'
 };
}
function pageOffers(tokens,page){
 const fidelity=tokens.some(t=>/^DESCONTO$/i.test(t.s));
 const anchors=tokens.filter(t=>fidelity?/^DESCONTO$/i.test(t.s):/^DE\s*:$/.test(t.s));
 const bands=[];
 for(const t of anchors.slice().sort((a,b)=>a.y-b.y||a.x-b.x)){
  let band=bands.at(-1);
  if(!band||Math.abs(t.y-band.y)>4){band={y:t.y,labels:[]};bands.push(band)}
  band.labels.push(t);
 }
 if(!bands.length)return [{page,note:'Formato não reconhecido. Confira esta página manualmente.'}];
 const offers=[], inset=fidelity?4:30;
 bands.forEach((band,row)=>{
  const cols=band.labels.sort((a,b)=>a.x-b.x);
  cols.forEach((anchor,col)=>{
   const cell=tokens.filter(t=>t.y>=band.y-inset&&t.y<(bands[row+1]?.y??Infinity)-inset
     &&t.x>=(col===0?-Infinity:anchor.x-3)&&t.x<(cols[col+1]?.x??Infinity)-3);
   offers.push({...readLabel(cell),page,note:'Linha '+(row+1)+' · etiqueta '+(col+1)+' de '+cols.length});
  });
 });
 return offers;
}
function groupCopies(records){
 const unique=new Map();
 for(const offer of records){
  // Unrecognized/incomplete labels stay separate for manual review.
  const key=offer.ean&&offer.end?JSON.stringify([offer.ean,offer.start,offer.end,offer.price,offer.original,offer.condition,offer.notes,offer.band]):Symbol();
  const found=unique.get(key);
  if(found){found.copies++;found.pages.add(String(offer.page));if(offer.name.length>found.name.length)found.name=offer.name}
  else unique.set(key,{...offer,copies:1,pages:new Set([String(offer.page)])});
 }
 return [...unique.values()].map(({pages,...offer})=>({...offer,page:[...pages].join(', '),note:(offer.model||'Conferência manual')+' · '+offer.copies+' etiqueta(s)'}));
}
