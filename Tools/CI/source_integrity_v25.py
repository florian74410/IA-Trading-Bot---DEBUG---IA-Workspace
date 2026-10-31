#!/usr/bin/env python3
"""Read-only integrity checks for the cleaned source checkout, no runtime imports."""
import argparse,csv,hashlib,json,pathlib,re,sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
def resolve_relative(root,filename,value):
    target=(root/filename).parent/value
    return any(p.is_file()for p in [target,pathlib.Path(str(target)+'.js'),pathlib.Path(str(target)+'.json'),pathlib.Path(str(target)+'.cjs'),target/'index.js',target/'index.json'])
def references(root,report):
    missing=[]
    for row in report['imports']:
        value=row['value']
        if isinstance(value,str)and value.startswith('.')and not resolve_relative(root,row['file'],value):
            missing.append({'file':row['file'],'unit':row['unit'],'value':value})
    for name in sorted((root/'App/Frontend/Pages').glob('*.html')):
        for value in re.findall(r'(?:src|href)\s*=\s*[\"\'](/assets/[^\"\'?#]+)',name.read_text()):
            target=value.removeprefix('/assets/')
            if not any((root/'App/Frontend'/d/target).is_file()for d in ['JS','CSS','Assets','Protocols']):
                missing.append({'file':name.relative_to(root).as_posix(),'unit':'asset','value':value})
    return sorted(missing,key=lambda x:tuple(x.values()))
def main():
    parser=argparse.ArgumentParser();parser.add_argument('audit');parser.add_argument('--capture-baseline');args=parser.parse_args()
    report=json.loads(pathlib.Path(args.audit).read_text())
    if args.capture_baseline:
        root=pathlib.Path(args.capture_baseline);print(json.dumps(references(root,report),indent=2));return
    errors=[];reviewed=json.loads((ROOT/'Tools/CI/baselines/p3_reviewed_252.json').read_text());plan_dir=ROOT/'Documentation/Cleanup/2.4.2-R1';plan=json.loads((plan_dir/'PLAN.json').read_text());inventory=list(csv.DictReader((plan_dir/'INVENTORY.tsv').open(),delimiter='\t'))
    for row in inventory:
        p=ROOT/row['path']
        if row['decision']=='DELETE'and p.exists()and row['path']!='App/Updates/update_history.dat':errors.append('planned removal still exists: '+row['path'])
        if row['path'].startswith(('App/Core/Communication/ProtocolRegistry/','App/Core/Clients/migrations/','App/Fundamental/Database/','App/Strategy/Schemas/','App/Core/Clients/UserManagement/','App/Indicators/BuiltIn/','App/Core/Firewall/','App/Core/ProcessRegistry/manifests/')):
            if not p.is_file():errors.append('protected contract missing: '+row['path'])
            elif row['path']=='App/Core/Communication/ProtocolRegistry/risk.json':
                try:
                    modified=json.loads(p.read_text())
                    new_commands={'risk.r1.evaluate':{'allowed':['intent','context']},'risk.r2.evaluate':{'allowed':['snapshot']},'risk.r2.monitor':{'allowed':[]}}
                    new_types={'risk.r1.decision':'risk.r1.decision/1.0','risk.r2.snapshot':'risk.r2.snapshot/1.0'}
                    new_event={'name':'risk.r2.alert','schema':'risk.r2.alert/1.0','description':'Compact, deduplicated R2 portfolio risk alert for Supervisor'}
                    names=[x.get('name')for x in modified['table']['commands']]
                    if any(names.count(k)!=1 for k in new_commands):raise ValueError('new CP1 commands absent or duplicated')
                    for command in modified['table']['commands']:
                        if command['name'] in new_commands and command.get('arguments')!=new_commands[command['name']]:raise ValueError('CP1 command policy changed')
                    for item in modified['table']['dataTypes']:
                        if item.get('name') in new_types and item!={'name':item['name'],'direction':'PRODUCE','schema':new_types[item['name']]}:raise ValueError('new data type changed')
                    if any(sum(x.get('name')==k for x in modified['table']['dataTypes'])!=1 for k in new_types):raise ValueError('risk types missing')
                    modified['table']['commands']=[x for x in modified['table']['commands']if x['name'] not in new_commands]
                    modified['table']['dataTypes']=[x for x in modified['table']['dataTypes']if x['name'] not in new_types]
                    if modified['table']['events'].count(new_event)!=1:raise ValueError('risk event invalid')
                    modified['table']['events'].remove(new_event)
                    baseline=(ROOT/'Tools/CI/baselines/risk_protocol_242.json').read_bytes()
                    if hashlib.sha256(baseline).hexdigest()!=row['sha256']:raise ValueError('baseline risk fingerprint invalid')
                    if modified!=json.loads(baseline):raise ValueError('original protected risk contract changed')
                except Exception as exc:errors.append('risk v2.5 CP1 contract unexpected modification: '+str(exc))
            elif row['path']=='App/Core/Clients/UserManagement/admin_routes.js':
                baseline=(ROOT/'Tools/CI/baselines/admin_routes_242.js').read_bytes()
                if hashlib.sha256(baseline).hexdigest()!=row['sha256']:errors.append('ADMIN baseline fingerprint invalid')
                addition=('  "GET /api/admin/risk/settings",'+chr(10)+'  "POST /api/admin/risk/settings",'+chr(10)).encode()
                current=p.read_bytes()
                if current.count(addition)!=1 or current.replace(addition,b'')!=baseline:errors.append('unexpected ADMIN auth route modification')
            elif row['path'] in reviewed:
                pin=reviewed[row['path']]
                if row['sha256']!=pin['baseline'] or hashlib.sha256(p.read_bytes()).hexdigest()!=pin['reviewed']:errors.append('unreviewed P3 contract change: '+row['path'])
            elif hashlib.sha256(p.read_bytes()).hexdigest()!=row['sha256']:errors.append('protected contract changed: '+row['path'])
    for row in report['files']:
        if row['path'].endswith('.json'):
            try:json.loads((ROOT/row['path']).read_text())
            except Exception as error:errors.append('JSON invalid: '+row['path']+': '+str(error))
    expected='2.5.3';app=ROOT/'App'
    for p in [app/'VERSION',app/'Frontend/Settings/VERSION']:
        if p.read_text().strip()!=expected:errors.append('version mismatch: '+str(p))
    for name in ['manifest.json','package.json','package-lock.json','Updates/current_release.dat']:
        obj=json.loads((app/name).read_text())
        if obj['version']!=expected:errors.append('version mismatch: '+name)
    if json.loads((app/'manifest.json').read_text()).get('revision')!='DEV':errors.append('revision mismatch')
    for unit in report['units']:
        if unit['status']=='PARSE_ERROR'or unit.get('scopeError'):errors.append('parse/scope error: '+unit['file'])
    active=[x for x in report['unused']if x['file'].startswith('App/')and not re.search(r'/Tests?/',x['file'],re.I)and not x['file'].startswith('App/Tools/')]
    extra=json.loads((plan_dir/'ADDENDUM.json').read_text()).get('M06',{}).get('delete',[])
    for row in extra:
        if (ROOT/row['path']).exists():errors.append('obsolete compatibility file remains: '+row['path'])
    if active:errors.append('unreviewed unused function/object: '+json.dumps(active))
    baseline=json.loads((plan_dir/'REFERENCE_BASELINE.json').read_text());missing=references(ROOT,report)
    additions=[x for x in missing if x not in baseline]
    if additions:errors.append('new broken import/asset: '+json.dumps(additions))
    if errors:print('\n'.join(errors),file=sys.stderr);return 1
    print(json.dumps({'ok':True,'filesInspected':len(report['files']),'unitsParsed':len(report['units']),'deletedFiles':plan['deleteCount']+len(extra),'protectedContracts':'unchanged except validated risk 2.5 additions and exactly pinned P3 runtime/Firewall changes','unusedActiveFunctionsAndObjects':0,'newBrokenImportsOrAssets':0,'preexistingUnresolvedReferences':len(missing)},indent=2));return 0
if __name__=='__main__':sys.exit(main())
