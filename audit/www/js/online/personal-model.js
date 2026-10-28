// The shared renderer reads the same v3 document as Personal Ledger.
export function toPersonal(d){
 if(d.personal)return structuredClone(d.personal);
 const accounts=d.accounts.map(a=>({...a,kind:'ledger',flow:'general',profitRate:a.rate||0,created:0,finance:{version:1,enabled:true,include:true,inRate:a.rate||0,outRate:a.rate||0,commissionRate:0,paid:0,payment:false}}));
 const entries=d.entries.map(e=>({id:e.id,accountId:e.accountId,date:e.date,time:e.time,amount:e.amount,effect:e.effect,partyId:null,party:'',typeId:null,typeName:e.type||'Transaction',note:e.note,rate:0,cost:0,movement:'debt',profitOnly:false,profitDisabled:e.rate===0,created:0,attachments:e.files.map((f,i)=>({...f,id:f.id||e.id+'-'+i})),finance:{version:1,enabled:true,include:true,inRate:e.rate??accounts.find(a=>a.id===e.accountId).profitRate,outRate:e.rate??accounts.find(a=>a.id===e.accountId).profitRate,commissionRate:0,paid:0,payment:false}}));
 const holds=d.holds.map(h=>{const hold={id:h.id,accountId:h.accountId,name:h.name,amount:h.amount,date:h.date,note:h.note||'',done:h.done};if(h.included&&!h.done){const id=h.id+'-entry';entries.push({id,accountId:h.accountId,date:h.date,time:'00:00',amount:h.amount,effect:h.effect,partyId:null,party:'',typeId:null,typeName:'Hold / To receive',note:h.note||'',rate:0,cost:0,movement:'debt',profitOnly:false,profitDisabled:true,created:0,attachments:[]});hold.ledgerEntryId=id;hold.ledgerEffect=h.effect;}return hold;});
 return {version:3,accounts,entries,holds,parties:[],types:d.types.map((name,i)=>({id:'group-type-'+i,name,effect:1}))};
}
export function validatePersonal(d){
 if(d?.version!==3||!['accounts','entries','parties','types'].every(k=>Array.isArray(d[k])))throw Error('Invalid shared ledger');
 if(d.accounts.length>100||d.entries.length>10000||JSON.stringify(d).length>42*1024*1024)throw Error('Group storage limit reached');
 for(const list of [d.accounts,d.entries,d.parties,d.types])if(new Set(list.map(x=>x.id)).size!==list.length)throw Error('Duplicate records');
 const ids=new Set(d.accounts.map(a=>a.id));
 for(const a of d.accounts)if(typeof a.name!=='string'||!a.name.trim()||a.name.length>80||!Number.isSafeInteger(a.opening))throw Error('Invalid account');
 for(const e of d.entries)if(!ids.has(e.accountId)||!Number.isSafeInteger(e.amount)||(e.amount<0||e.amount===0&&!(e.finance?.enabled===true&&e.finance.payment===false&&Number.isSafeInteger(e.finance.paid)&&e.finance.paid>0&&e.finance.paid<=1000000000000&&!e.holdMode))||![-1,1].includes(e.effect)||typeof e.note!=='string'||!Array.isArray(e.attachments))throw Error('Invalid transaction');
 return d;
}
