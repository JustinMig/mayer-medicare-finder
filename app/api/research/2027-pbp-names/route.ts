import { NextResponse } from 'next/server'
import { inflateRawSync } from 'node:zlib'
export const runtime='nodejs'; export const maxDuration=120
const URL='https://www.cms.gov/files/zip/pbp-benefits-2027.zip'
function eocd(b:Buffer){const m=Math.max(0,b.length-65557);for(let o=b.length-22;o>=m;o--)if(b.readUInt32LE(o)===0x06054b50)return o;return -1}
export async function GET(){const r=await fetch(URL,{cache:'no-store'});const b=Buffer.from(await r.arrayBuffer());const e=eocd(b);if(e<0)throw new Error('no eocd');const n=b.readUInt16LE(e+10),co=b.readUInt32LE(e+16);let p=co;const names:any[]=[];for(let i=0;i<n;i++){if(b.readUInt32LE(p)!==0x02014b50)break;const size=b.readUInt32LE(p+24),fn=b.readUInt16LE(p+28),ex=b.readUInt16LE(p+30),cm=b.readUInt16LE(p+32),name=b.subarray(p+46,p+46+fn).toString('utf8');p+=46+fn+ex+cm;names.push({name,size})}return NextResponse.json({entries:n,names},{headers:{'Cache-Control':'no-store'}})}
