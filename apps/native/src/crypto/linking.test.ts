import { openSecret, randomPin, sealSecret } from './linking-core';
import { randomBytes } from './primitives';
let pass=0, fail=0;
const ok=(n:string,c:boolean)=>{c?pass++:(fail++,console.log('  ✗',n));};
const same=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const secret = randomBytes(32);
const pin = randomPin();
ok('pin is 6 digits', /^[0-9]{6}$/.test(pin));
const code = sealSecret(secret, pin);
ok('code has version prefix', code.startsWith('K1.'));
ok('round-trip with right pin', same(openSecret(code, pin), secret));
let threw=false; try { openSecret(code, '000000'==pin?'111111':'000000'); } catch { threw=true; }
ok('wrong pin rejected', threw);
let threw2=false; try { openSecret('garbage', pin); } catch { threw2=true; }
ok('garbage code rejected', threw2);
console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
