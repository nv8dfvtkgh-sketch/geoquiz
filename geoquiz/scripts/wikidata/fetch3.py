from sparql import *
import json
out={}
out['ma']=q(f'''SELECT * WHERE {{
 ?p wdt:P31 wd:Q5; wdt:P641 ?s; wdt:P27 wd:Q1028; wikibase:sitelinks ?links. FILTER(?links > 18)
 FILTER(?s != wd:Q2736)
 {labels('p')} {labels('s')} }}''')
out['afr']=q(f'''SELECT * WHERE {{
 ?p wdt:P31 wd:Q5; wdt:P641 ?s; wdt:P27 ?c; wikibase:sitelinks ?links. FILTER(?links > 28)
 ?c wdt:P30 wd:Q15; wdt:P297 ?iso. FILTER(?s != wd:Q2736)
 {labels('p')} {labels('s')} {labels('c')} }}''')
for k,v in out.items(): print(k,len(v))
json.dump(out,open('fetch3.json','w'),ensure_ascii=False)
