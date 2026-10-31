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
    errors=[];plan_dir=ROOT/'Documentation/Cleanup/2.4.2-R1';plan=json.loads((plan_dir/'PLAN.json').read_text());inventory=list(csv.DictReader((plan_dir/'INVENTORY.tsv').open(),delimiter='\t'))
    for row in inventory:
        p=ROOT/row['path']
        if row['decision']=='DELETE'and p.exists()and row['path']!='App/Updates/update_history.dat':errors.append('planned removal still exists: '+row['path'])
        if row['path'].startswith(('App/Core/Communication/ProtocolRegistry/','App/Core/Clients/migrations/','App/Fundamental/Database/','App/Strategy/Schemas/','App/Core/Clients/UserManagement/','App/Indicators/BuiltIn/','App/Core/Firewall/','App/Core/ProcessRegistry/manifests/')):
            if not p.is_file()or hashlib.sha256(p.read_bytes()).hexdigest()!=row['sha256']:errors.append('protected contract changed: '+row['path'])
    for row in report['files']:
        if row['path'].endswith('.json'):
            try:json.loads((ROOT/row['path']).read_text())
            except Exception as error:errors.append('JSON invalid: '+row['path']+': '+str(error))
    expected='2.4.2';app=ROOT/'App'
    for p in [app/'VERSION',app/'Frontend/Settings/VERSION']:
        if p.read_text().strip()!=expected:errors.append('version mismatch: '+str(p))
    for name in ['manifest.json','package.json','package-lock.json','Updates/current_release.dat']:
        obj=json.loads((app/name).read_text())
        if obj['version']!=expected:errors.append('version mismatch: '+name)
    if json.loads((app/'manifest.json').read_text()).get('revision')!='R1':errors.append('revision mismatch')
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
    print(json.dumps({'ok':True,'filesInspected':len(report['files']),'unitsParsed':len(report['units']),'deletedFiles':plan['deleteCount']+len(extra),'protectedContracts':'unchanged','unusedActiveFunctionsAndObjects':0,'newBrokenImportsOrAssets':0,'preexistingUnresolvedReferences':len(missing)},indent=2));return 0
if __name__=='__main__':sys.exit(main())
