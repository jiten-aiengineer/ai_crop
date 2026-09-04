/* eslint-disable @typescript-eslint/no-require-imports -- Node's dependency-free CommonJS test harness. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');

// Load real TypeScript modules without a test framework or provider network requests.
function load(file, overrides={}) {
  const filename=path.resolve(__dirname,'..',file);
  const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const loaded={exports:{}};
  const customRequire=name=>{
    if(overrides[name])return overrides[name];
    if(name.startsWith('.')){const target=path.resolve(path.dirname(filename),name);return name.endsWith('.json')?JSON.parse(fs.readFileSync(target,'utf8')):load(path.relative(path.resolve(__dirname,'..'),target+'.ts'),overrides);}
    return require(name);
  };
  vm.runInNewContext(source,{module:loaded,exports:loaded.exports,require:customRequire,process,fetch:(...args)=>global.fetch(...args),AbortSignal,Response,Request,File,Uint8Array,TextEncoder,TextDecoder,crypto:global.crypto,btoa,Date,console},{filename});
  return loaded.exports;
}
const data={crop:'Tomato',crop_confidence:.9,condition:'affected',issue_detected:true,issue_type:'fungal_disease',probable_issue:'Early blight',confidence:.85,severity:'moderate',visible_symptoms:['Brown spots']};
const input={context:{crop:'Tomato',plant:'',description:'Brown spots',location:'',notes:'',language:'en'},images:[{mimeType:'image/png',data:'dGVzdA=='}]};
const ai=load('app/lib/inspection-ai.ts');
const catalogue=load('app/lib/catalog.ts');

test('normalized output preserves legacy catalogue matching without invented products',()=>{
  const normalized=ai.normalizeDiagnosis({...data,products:[{name:'Invented Spray'}]});
  const legacy=ai.legacyDiagnosis(normalized);
  assert.equal(legacy.likely_issue,'Early blight');
  assert.equal(legacy.plant_condition,'affected');
  assert.equal(normalized.products,undefined);
  const recommendations=catalogue.catalogRecommendations({...legacy,catalog_crop:'Tomato'});
  assert.ok(recommendations.length>0,'Existing tomato catalogue matches must survive the adapter');
  const ids=new Set(catalogue.catalog.map(p=>p.id));
  assert.ok(recommendations.every(p=>ids.has(p.id)));
});

test('null confidence is retained in comparison diagnosis',()=>{
  assert.equal(ai.normalizeDiagnosis({...data,confidence:undefined}).confidence,null);
  assert.throws(()=>ai.normalizeDiagnosis({crop:'Tomato'}));
});

test('Gemini parsing ignores thought output and strips extra raw fields',async()=>{
  const prior=global.fetch; const oldKey=process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY='test-only';
  global.fetch=async()=>Response.json({candidates:[{content:{parts:[{thought:true,text:'hidden'},{text:JSON.stringify({...data,thinking:'hidden',products:['invented']})}]}}]});
  try{const result=await ai.geminiInspection(input);assert.equal(result.success,true);assert.equal(result.rawResponse.thinking,undefined);assert.equal(result.rawResponse.products,undefined);}finally{global.fetch=prior;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;}
});

test('shadow enqueue failure cannot change Gemini diagnosis',async()=>{
  const names=['QWEN_ENABLED','QWEN_SHADOW_MODE','COMPARISON_SERVICE_URL','COMPARISON_SERVICE_TOKEN'];
  const old=Object.fromEntries(names.map(n=>[n,process.env[n]]));const prior=global.fetch;
  Object.assign(process.env,{QWEN_ENABLED:'true',QWEN_SHADOW_MODE:'true',COMPARISON_SERVICE_URL:'http://private.invalid',COMPARISON_SERVICE_TOKEN:'test-only'});
  const gemini={provider:'gemini',success:true,diagnosis:ai.normalizeDiagnosis(data)};
  global.fetch=async()=>{throw new Error('offline');};
  try{const result=await ai.queueShadow(input,gemini,'test-case');assert.equal(result.status,'unavailable');assert.equal(gemini.success,true);assert.equal(gemini.diagnosis.probable_issue,'Early blight');}finally{global.fetch=prior;for(const n of names){if(old[n]===undefined)delete process.env[n];else process.env[n]=old[n];}}
});

test('administrator proxy fails closed before any service request',async()=>{
  const prior=global.fetch;const old=process.env.COMPARISON_ADMIN_TOKEN;delete process.env.COMPARISON_ADMIN_TOKEN;
  global.fetch=async()=>{throw new Error('Should never call private service');};
  try{const route=load('app/api/admin/ai-comparison/route.ts');const response=await route.GET(new Request('http://test/api/admin/ai-comparison'));assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store');}finally{global.fetch=prior;if(old!==undefined)process.env.COMPARISON_ADMIN_TOKEN=old;}
});
