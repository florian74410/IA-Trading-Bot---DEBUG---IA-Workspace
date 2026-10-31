'use strict';
// The retired installer is no longer imported or reachable from the application.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
test('legacy updater and project explorer implementations are retired; recovery launcher remains',()=>{
 for(const f of ['Core/Updates/update_manager_v1.0.js','Core/Updates/ai_update_builder_v1.0.js','Frontend/JS/update_ui_v1.0.js','Frontend/JS/project_explorer_v2.0.js','Frontend/CSS/project_explorer_v2.0.css'])assert.equal(fs.existsSync(path.join(root,f)),false,f);
 const core=fs.readFileSync(path.join(root,'Core/Server/server.js'),'utf8'),gateway=fs.readFileSync(path.join(root,'UI/Gateway/ui_service.js'),'utf8');
 assert.doesNotMatch(core,/new UpdateManager|new AIUpdateBuilder|function executeAIUpdate|update\.ai\.build|p==='\/api\/(?:updates|ai-updates)/);
 assert.doesNotMatch(gateway,/function projectTree|function projectFilePreview|p==='\/ui-api\/project-/);
 const launcher=fs.readFileSync(path.join(root,'launcher.js'),'utf8');assert.match(launcher,/function rollbackPending/);assert.match(launcher,/appendHistory/);
});
