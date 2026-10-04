const { spawnSync } = require('node:child_process')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const median = a => { const s=[...a].sort((a,b)=>a-b), i=Math.floor(s.length/2); return s.length%2?s[i]:(s[i-1]+s[i])/2 }
const samples = []
for (let round=0;round<8;round++) {
  for (const label of round%2 ? ['current','baseline'] : ['baseline','current']) {
    const modulePath=label==='baseline'?process.env.SOUNDING_BASELINE:path.resolve(__dirname,'..')
    const start=performance.now()
    const result=spawnSync(process.execPath,[path.join(__dirname,'hook-lifecycle.js')],{
      env:{...process.env,SOUNDING_MODULE:modulePath,SOUNDING_BENCH_ROUNDS:'1'},encoding:'utf8',timeout:20000})
    if(result.status!==0) throw new Error(`${label} failed: ${result.stderr}\n${result.stdout}`)
    const totalMs=performance.now()-start
    const measured=JSON.parse(result.stdout)
    samples.push({round,label,totalProcessMs:totalMs,...measured})
  }
}
const summary={}
for(const label of ['baseline','current']) {
  const runs=samples.filter(s=>s.label===label)
  summary[label]={totalProcessMs:median(runs.map(r=>r.totalProcessMs))}
  for(const name of Object.keys(runs[0].summary)) summary[label][name]=median(runs.map(r=>r.summary[name].medianMs))
}
console.log(JSON.stringify({method:'Eight alternating fresh child processes per version, one fixture round each; timings include measured cleanup; no browser dependency installed.',summary,samples},null,2))
