import { NextResponse } from 'next/server'
import { inflateRawSync } from 'node:zlib'
export const runtime='nodejs'
export const maxDuration=120
const URL='https://www.cms.gov/files/zip/pbp-benefits-2027.zip'
function findEocd(b:Buffer){const m=Math.max(0,b.length-65557);for(let o=b.length-22;o>=m;o--)if(b.readUInt32LE(o)===0x06054b50)return o;return -1}
function entries(b:Buffer){const e=findEocd(b);if(e<0)throw new Error('no eocd');const n=b.readUInt16LE(e+10),c=b.readUInt32LE(e+16);let p=c;const out:any[]=[];for(let i=0;i<n;i++){if(b.readUInt32LE(p)!==0x02014b50)break;const method=b.readUInt16LE(p+10),size=b.readUInt32LE(p+20),fn=b.readUInt16LE(p+28),ex=b.readUInt16LE(p+30),co=b.readUInt16LE(p+32),lo=b.readUInt32LE(p+42),name=b.subarray(p+46,p+46+fn).toString('utf8');p+=46+fn+ex+co;if(b.readUInt32LE(lo)!==0x04034b50)continue;const lfn=b.readUInt16LE(lo+26),lex=b.readUInt16LE(lo+28),st=lo+30+lfn+lex,comp=b.subarray(st,st+size),raw=method===0?comp:method===8?inflateRawSync(comp):null;if(!raw)continue;const txt=/\.(csv|txt|json)$/i.test(name)?raw.subarray(0,Math.min(raw.length,16000)).toString('utf8').replace(/^\uFEFF/,''):'';out.push({name,bytes:raw.length,preview:txt.slice(0,5000)})}return out}
export async function GET(){const r=await fetch(URL,{cache:'no-store',headers:{Accept:'application/zip,*/*'}});if(!r.ok)return NextResponse.json({error:'download',status:r.status},{status:502});const b=Buffer.from(await r.arrayBuffer());const es=entries(b);return NextResponse.json({source:URL,zip_bytes:b.length,entries:es},{headers:{'Cache-Control':'no-store'}})}
