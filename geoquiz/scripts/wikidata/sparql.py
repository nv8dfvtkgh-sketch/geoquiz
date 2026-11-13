import json, urllib.request, urllib.parse, os, hashlib, time
UA='Quizellige/1.0 (educational geography quiz; contact via site) python-urllib'
def q(query, cache=True):
    h=hashlib.md5(query.encode()).hexdigest()[:12]; p=f'cache/{h}.json'
    os.makedirs('cache',exist_ok=True)
    if cache and os.path.exists(p): return json.load(open(p))
    data=urllib.parse.urlencode({'query':query,'format':'json'}).encode()
    for i in range(3):
        try:
            r=urllib.request.urlopen(urllib.request.Request('https://query.wikidata.org/sparql',data=data,headers={'User-Agent':UA,'Accept':'application/sparql-results+json'}),timeout=120)
            res=[{k:v['value'] for k,v in b.items()} for b in json.load(r)['results']['bindings']]
            json.dump(res,open(p,'w')); return res
        except Exception as e:
            print('retry',e); time.sleep(5)
    raise SystemExit('échec')
LANGS=['fr','en','es','ar']
def labels(var):
    return ' '.join(f'OPTIONAL{{?{var} rdfs:label ?{var}_{l} FILTER(lang(?{var}_{l})="{l}")}}' for l in LANGS)
def names(row,var):
    n={l:row.get(f'{var}_{l}') for l in LANGS}
    return n if all(n.values()) else None
