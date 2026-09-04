/* eslint-disable @typescript-eslint/no-require-imports */
const {spawn}=require('node:child_process');
const {existsSync}=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
if(!existsSync(python))throw new Error('Project Python environment is missing. Install backend/requirements.txt in .venv first.');
if(!existsSync(path.join(root,'.comparison-data/ui/index.html')))throw new Error('Run npm run comparison:build first.');
// Only local process configuration; no edits to stored credentials or public deployment settings.
const child=spawn(python,['-m','uvicorn','backend.app.comparison:app','--host','127.0.0.1','--port','8001','--workers','1','--no-proxy-headers'],{
  cwd:root,stdio:'inherit',windowsHide:true,
  env:{...process.env,COMPARISON_LOCAL_MODE:'true',QWEN_ENABLED:'true',QWEN_SHADOW_MODE:'false',QWEN_BASE_URL:process.env.QWEN_BASE_URL||'http://127.0.0.1:11434',QWEN_MODEL:process.env.QWEN_MODEL||'qwen3.5:9b'},
});
console.log('Crop Life AI local lab: http://127.0.0.1:8001 — no administrator key needed.');
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
process.on('SIGINT',()=>child.kill('SIGINT'));
process.on('SIGTERM',()=>child.kill('SIGTERM'));
