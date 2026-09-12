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
  const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const loaded={exports:{}};
  const customRequire=name=>{
    if(name.endsWith('.css'))return {};
    if(overrides[name])return overrides[name];
    if(name.startsWith('.')){const target=path.resolve(path.dirname(filename),name);return name.endsWith('.json')?JSON.parse(fs.readFileSync(target,'utf8')):load(path.relative(path.resolve(__dirname,'..'),target+'.ts'),overrides);}
    return require(name);
  };
  vm.runInNewContext(source,{module:loaded,exports:loaded.exports,require:customRequire,process,fetch:(...args)=>global.fetch(...args),AbortSignal,Response,Request,File,URL,Uint8Array,TextEncoder,TextDecoder,crypto:global.crypto,btoa,Date,console},{filename});
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
  const incomplete=ai.normalizeDiagnosis({crop:'Tomato'});
  assert.equal(incomplete.issue_type,'unknown');
  assert.equal(incomplete.issue_detected,false);
  assert.equal(incomplete.needs_more_information,true);
});

test('Gemini parsing ignores thought output and strips extra raw fields',async()=>{
  const prior=global.fetch; const oldKey=process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY='test-only';
  global.fetch=async()=>Response.json({candidates:[{content:{parts:[{thought:true,text:'hidden'},{text:JSON.stringify({...data,thinking:'hidden',products:['invented']})}]}}]});
  try{const result=await ai.geminiInspection(input);assert.equal(result.success,true);assert.equal(result.rawResponse.thinking,undefined);assert.equal(result.rawResponse.products,undefined);}finally{global.fetch=prior;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;}
});

test('declared field crop remains authoritative across wrapped and array output',()=>{
  const wrapped=ai.normalizeDiagnosis([{assessment:{...data,crop:'Rice',cropConfidence:'98%',confidence:'84%',needsMoreInformation:false}}],'Tomato');
  assert.equal(wrapped.crop,'Tomato');
  assert.equal(wrapped.crop_confidence,null);
  assert.equal(wrapped.confidence,.84);
  assert.equal(wrapped.needs_more_information,false);
  assert.equal(ai.canMatchProducts(wrapped,'Tomato'),true);
});

test('low-confidence or incomplete evidence cannot trigger product matching',()=>{
  const low=ai.normalizeDiagnosis({...data,confidence:59,needs_more_information:false},'Tomato');
  assert.equal(ai.diagnosisConfidenceLevel(low.confidence),'low');
  assert.equal(ai.canMatchProducts(low,'Tomato'),false);
  const incomplete=ai.normalizeDiagnosis({crop:'Tomato'},'Tomato');
  assert.equal(ai.canMatchProducts(incomplete,'Tomato'),false);
});

test('administrator proxy fails closed before any service request',async()=>{
  const prior=global.fetch;const old=process.env.COMPARISON_ADMIN_TOKEN;delete process.env.COMPARISON_ADMIN_TOKEN;
  global.fetch=async()=>{throw new Error('Should never call private service');};
  try{const route=load('app/api/admin/ai-comparison/route.ts');const response=await route.GET(new Request('http://test/api/admin/ai-comparison'));assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store');}finally{global.fetch=prior;if(old!==undefined)process.env.COMPARISON_ADMIN_TOKEN=old;}
});

test('local lab opens on upload controls without a password',()=>{
  const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
  const Dashboard=load('app/components/ComparisonDashboard.tsx',{'next/link':props=>React.createElement('a',props)}).default;
  const html=renderToStaticMarkup(React.createElement(Dashboard,{localMode:true,initialLab:true}));
  assert.ok(html.includes('Upload photos'));
  assert.ok(html.includes('Run both models'));
  assert.ok(!html.includes('type="password"'));
});

test('unconfigured public page offers local link instead of an impossible key form',()=>{
  const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
  const Dashboard=load('app/components/ComparisonDashboard.tsx',{'next/link':props=>React.createElement('a',props)}).default;
  const html=renderToStaticMarkup(React.createElement(Dashboard,{configured:false}));
  assert.ok(html.includes('http://127.0.0.1:8001/'));
  assert.ok(!html.includes('type="password"'));
});

test('private S3 inspection archive uses IAM SDK defaults and non-PII UUID keys',async()=>{
  const names=['AWS_REGION','S3_BUCKET_NAME','S3_INSPECTIONS_PREFIX'];const old=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const sent=[];
  class S3Client{constructor(options){this.options=options;}async send(command){sent.push(command);}}
  class PutObjectCommand{constructor(input){this.input=input;}}
  class DeleteObjectCommand{constructor(input){this.input=input;}}
  Object.assign(process.env,{AWS_REGION:'us-east-1',S3_BUCKET_NAME:'crop-life-ai-data',S3_INSPECTIONS_PREFIX:'inspections'});
  try{
    const sdk={S3Client,PutObjectCommand,DeleteObjectCommand};
    const storage=load('app/lib/s3-storage.ts',{
      '@aws-sdk/client-s3':sdk,
      'node:module':{createRequire:()=>name=>name==='@aws-sdk/client-s3'?sdk:require(name)},
    });
    const result=await storage.storeInspectionImages('550e8400-e29b-41d4-a716-446655440000',[{bytes:new Uint8Array([1,2,3]),mimeType:'image/jpeg',imageOrder:1}]);
    assert.equal(result.status,'stored');assert.equal(result.images[0].bucket,'crop-life-ai-data');
    assert.match(result.images[0].key,/^inspections\/\d{4}\/\d{2}\/\d{2}\/550e8400-e29b-41d4-a716-446655440000\/image-01\.jpg$/);
    assert.deepEqual(sent[0].input.Bucket,'crop-life-ai-data');assert.equal(sent[0].input.ContentType,'image/jpeg');
    assert.equal(sent[0].input.ServerSideEncryption,'AES256');assert.equal(sent[0].input.ACL,undefined);
    assert.equal(new S3Client({region:'unused'}).options.credentials,undefined);
  }finally{for(const name of names){if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name];}}
});

test('inspection persistence is skipped safely until its private server token is configured',async()=>{
  const names=['INSPECTION_PERSISTENCE_URL','INSPECTION_PERSISTENCE_TOKEN'];const old=Object.fromEntries(names.map(name=>[name,process.env[name]]));const prior=global.fetch;
  const payload={inspectionId:'550e8400-e29b-41d4-a716-446655440000',imageCount:1,input,storage:{status:'not_configured',images:[],failures:[]},provider:{provider:'gemini',model:'test',success:false,latencyMs:3,timestamp:'now',error:'offline'},recommendations:[]};
  delete process.env.INSPECTION_PERSISTENCE_URL;delete process.env.INSPECTION_PERSISTENCE_TOKEN;global.fetch=async()=>{throw new Error('must not call');};
  try{
    const persistence=load('app/lib/inspection-persistence.ts');
    assert.equal((await persistence.persistInspection(payload)).status,'skipped');
  }finally{global.fetch=prior;for(const name of names){if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name];}}
});

test('inspection persistence returns the durable shadow queue state',async()=>{
  const names=['INSPECTION_PERSISTENCE_URL','INSPECTION_PERSISTENCE_TOKEN'];const old=Object.fromEntries(names.map(name=>[name,process.env[name]]));const prior=global.fetch;
  const payload={inspectionId:'550e8400-e29b-41d4-a716-446655440000',collectionMode:'general_employee',imageCount:1,input,storage:{status:'stored',images:[{bucket:'private',key:'inspections/test.jpg',mimeType:'image/jpeg',fileSizeBytes:4,imageOrder:1}],failures:[]},provider:{provider:'gemini',model:'test',success:true,latencyMs:3,timestamp:'now',diagnosis:data},recommendations:[]};
  Object.assign(process.env,{INSPECTION_PERSISTENCE_URL:'http://127.0.0.1:8000/api/v1/inspections/persist',INSPECTION_PERSISTENCE_TOKEN:'test-only'});
  global.fetch=async()=>Response.json({status:'saved',shadow_status:'pending'},{status:201});
  try{
    const persistence=load('app/lib/inspection-persistence.ts');
    const result=await persistence.persistInspection(payload);
    assert.equal(result.status,'saved');assert.equal(result.shadowStatus,'pending');
  }finally{global.fetch=prior;for(const name of names){if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name];}}
});
