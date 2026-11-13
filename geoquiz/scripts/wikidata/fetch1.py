from sparql import *
import json
out={}
# Fleuve qui traverse la capitale
out['caprivers']=q(f'''SELECT * WHERE {{
 ?c wdt:P31 wd:Q3624078; wdt:P297 ?iso; wdt:P36 ?city; wikibase:sitelinks ?links. FILTER NOT EXISTS {{?c wdt:P576 ?e}}
 ?city wdt:P206 ?r. ?r wdt:P31/wdt:P279* wd:Q4022.
 {labels('c')} {labels('city')} {labels('r')} }}''')
# Grands fleuves : longueur, embouchure, continent
out['rivers']=q(f'''SELECT * WHERE {{
 ?r wdt:P31/wdt:P279* wd:Q4022; wdt:P2043 ?len; wikibase:sitelinks ?links. FILTER(?len > 1000)
 OPTIONAL{{?r wdt:P403 ?m. {labels('m')}}}
 {labels('r')} }}''')
# Lacs : superficie, profondeur
out['lakes']=q(f'''SELECT * WHERE {{
 ?l wdt:P31/wdt:P279* wd:Q23397; wdt:P2046 ?area; wikibase:sitelinks ?links. FILTER(?links > 60)
 OPTIONAL{{?l wdt:P4511 ?depth}} OPTIONAL{{?l wdt:P17 ?c. ?c wdt:P297 ?iso}}
 {labels('l')} }}''')
for k,v in out.items(): print(k,len(v))
json.dump(out,open('fetch1.json','w'),ensure_ascii=False)
