// 預先算好音樂每格（30fps）的音量與節拍強度，給影片與網頁共用
import {execFileSync} from 'child_process';
import fs from 'fs';
const sr=22050,fps=30,dur=80;
const b=execFileSync('ffmpeg',['-v','error','-t',String(dur),'-i','music/volatile_reaction.mp3','-ac','1','-ar',String(sr),'-f','s16le','-'],{maxBuffer:1e9});
const a=new Int16Array(b.buffer,b.byteOffset,b.length/2);
const hop=sr/fps,n=Math.floor(a.length/hop),rms=[];
for(let i=0;i<n;i++){let q=0;for(let j=i*hop;j<(i+1)*hop;j++)q+=(a[j]/32768)**2;rms.push(Math.sqrt(q/hop))}
const sorted=[...rms].sort((x,y)=>x-y),mx=sorted[Math.floor(n*.98)];
const r=rms.map(v=>Math.min(1,v/mx));
// 節拍：比前 0.4 秒平均高出的部分
const on=r.map((v,i)=>{let s=0,c=0;for(let k=Math.max(0,i-12);k<i;k++){s+=r[k];c++}return Math.max(0,v-(c?s/c:v))});
const om=[...on].sort((x,y)=>x-y)[Math.floor(n*.98)]||1;
const f=x=>Math.round(x*100)/100;
fs.writeFileSync('audio_env.js',`window.AUDIO_ENV={fps:${fps},rms:[${r.map(f)}],on:[${on.map(v=>f(Math.min(1,v/om)))}]};\n`);
console.log('frames',n);
