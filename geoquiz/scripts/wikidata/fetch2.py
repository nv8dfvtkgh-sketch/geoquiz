from sparql import *
import json
out={}
# Inventions : objet ou technique dont l'inventeur (P61) est une personne
out['inv']=q(f'''SELECT * WHERE {{
 ?i wdt:P61 ?p; wikibase:sitelinks ?links. FILTER(?links > 70)
 ?p wdt:P31 wd:Q5. OPTIONAL{{?p wdt:P27 ?c. ?c wdt:P297 ?iso}}
 OPTIONAL{{?i wdt:P575 ?date}}
 {labels('i')} {labels('p')} }}''')
# Sportifs africains célèbres (dont marocains)
out['ath']=q(f'''SELECT * WHERE {{
 ?p wdt:P31 wd:Q5; wdt:P641 ?s; wdt:P1532 ?c; wikibase:sitelinks ?links. FILTER(?links > 40)
 ?c wdt:P30 wd:Q15; wdt:P297 ?iso.
 OPTIONAL{{?p wdt:P569 ?born}}
 {labels('p')} {labels('s')} {labels('c')} }}''')
for k,v in out.items(): print(k,len(v))
json.dump(out,open('fetch2.json','w'),ensure_ascii=False)
