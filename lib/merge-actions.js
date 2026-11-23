'use strict';
const assert = require('assert').strict;
function poolStrings(bytes) {
 const count=bytes.readUInt16LE(0), strings=[];let p=2;
 for(let i=0;i<count;i++){const end=bytes.indexOf(0,p);assert(end>=p);strings.push(bytes.subarray(p,end));p=end+1;}
 assert.equal(p,bytes.length);return strings;
}
function action(op,body){if(op<128)return Buffer.from([op]);assert(body.length<=65535);const header=Buffer.alloc(3);header[0]=op;header.writeUInt16LE(body.length,1);return Buffer.concat([header,body]);}
function merge(blocks){
 const strings=[],indices=new Map();
 function intern(bytes){const key=bytes.toString('hex');if(!indices.has(key)){indices.set(key,strings.length);strings.push(bytes);}return indices.get(key);}
 function rewrite(bytes,pool){
  let p=0;const records=[];
  while(p<bytes.length){
   const start=p,op=bytes[p++];let len=0;
   if(op>=128){len=bytes.readUInt16LE(p);p+=2;}assert(p+len<=bytes.length);
   let body=bytes.subarray(p,p+len);p+=len;let encoded;
   if(op===136){pool=poolStrings(body).map(intern);encoded=Buffer.alloc(0);}
   else if(op===150){
    const parts=[];let q=0;
    while(q<body.length){const type=body[q++],begin=q;
     if(type===8||type===9){
      const index=type===8?body[q]:body.readUInt16LE(q);q+=type===8?1:2;
      assert(pool && index<pool.length,'Constant outside pool');
      const mapped=pool[index],value=Buffer.alloc(3);value[0]=9;value.writeUInt16LE(mapped,1);parts.push(value);
     }else{
      if(type===0){const end=body.indexOf(0,q);assert(end>=q);q=end+1;}
      else if(type===1||type===7)q+=4;else if(type===6)q+=8;else if(type===4||type===5)q++;else assert(type===2||type===3,'Unknown Push type');
      assert(q<=body.length);parts.push(Buffer.concat([Buffer.from([type]),body.subarray(begin,q)]));
     }
    }
    encoded=action(op,Buffer.concat(parts));
   }else if(op===142||op===155){
    assert(body.length>=2);const size=body.readUInt16LE(body.length-2);assert(p+size<=bytes.length);
    const child=rewrite(bytes.subarray(p,p+size),pool);p+=size;
    assert(child.length<=65535,'Function too large');const header=Buffer.from(body);header.writeUInt16LE(child.length,header.length-2);
    encoded=Buffer.concat([action(op,header),child]);
   }else{
    assert(![143,148,138,141].includes(op),'Unsupported action container/control');
    encoded=action(op,body);
   }
   records.push({start,end:p,op,body,encoded});
  }
  let total=0;const offsets=new Map([[bytes.length,0]]);
  for(const record of records){offsets.set(record.start,total);record.outputStart=total;total+=record.encoded.length;}
  offsets.set(bytes.length,total);
  for(const record of records)if(record.op===153||record.op===157){
   assert.equal(record.body.length,2);const target=record.end+record.body.readInt16LE(0);assert(offsets.has(target),'Branch boundary missing');
   const relative=offsets.get(target)-(record.outputStart+record.encoded.length);assert(relative>=-32768&&relative<=32767,'Branch overflow');record.encoded.writeInt16LE(relative,3);
  }
  return Buffer.concat(records.map(r=>r.encoded));
 }
 const rewritten=blocks.map(bytes=>rewrite(bytes,null));
 const count=Buffer.alloc(2);count.writeUInt16LE(strings.length);
 const pool=action(136,Buffer.concat([count,...strings.map(s=>Buffer.concat([s,Buffer.from([0])]))]));
 for(const bytes of rewritten)assert.equal(bytes[bytes.length-1],0);
 return Buffer.concat([pool,...rewritten.map(b=>b.subarray(0,-1)),Buffer.from([0])]);
}
module.exports={merge};
