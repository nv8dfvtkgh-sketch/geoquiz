# Génère 4 jeux à partir de Wikidata (données en cache) : sommets et fleuves, records,
# inventeurs, sportifs africains. Faits vérifiés et triés à la main (listes ci-dessous).
import json, random
from sparql import q, labels, LANGS
from inv_items import ITEMS, Q
random.seed(2026)
L=LANGS
def nm(r,v): 
    n={l:r.get(f'{v}_{l}') for l in L}
    return n if all(n.values()) else None
def mk(pid,i,tier,qq,ans,dis,emoji):
    a=[ans]+dis
    assert len(a)==4 and len({x['fr'] for x in a})==4, (pid,i,[x['fr'] for x in a])
    for x in a: assert all(x.get(l) for l in L), x
    return {'id':f'{pid}-{i}','tier':tier,'q':qq,'a':a,'emoji':emoji}
def cap(s): return s[0].upper()+s[1:]
packs={}

# ------------------------------------------------------------------ sommets et fleuves
d1=json.load(open('fetch1.json'))
peaks_rows=q(f'''SELECT * WHERE {{
 ?c wdt:P31 wd:Q3624078; wdt:P297 ?iso; wdt:P610 ?p; wikibase:sitelinks ?links.
 FILTER NOT EXISTS {{?c wdt:P576 ?end}}
 OPTIONAL{{?p wdt:P2044 ?elev}} {labels('c')} {labels('p')} }}''')
PEAK_OK='TR FR RU JP DE IN MX CA ES GB NO EG PL CH GR IR DZ AT SE VN ID PK KR NZ SA ET VE MY KE MA PE SI TN LB EC CL CM TD CD NP'.split()
OVERRIDE={  # libellés manquants ou trompeurs dans Wikidata
 'US':({'fr':'Denali','en':'Denali','es':'Denali','ar':'دينالي'},6190),
 'AR':({'fr':'Aconcagua','en':'Aconcagua','es':'Aconcagua','ar':'أكونكاغوا'},6961),
 'TZ':({'fr':'Kilimandjaro','en':'Kilimanjaro','es':'Kilimanjaro','ar':'كليمنجارو'},5895),
}
peaks={}; country={}
for r in peaks_rows:
    c=nm(r,'c')
    if c: country[r['iso']]=(c,int(r['links']))
    if r['iso'] in PEAK_OK and nm(r,'p') and r['iso'] not in peaks: peaks[r['iso']]=(nm(r,'p'),float(r.get('elev') or 0))
for k,v in OVERRIDE.items(): peaks[k]=v
country['US']=country.get('US'); country['AR']=country.get('AR')
# Noms courts des pays (Wikidata donne « République populaire de Chine »…)
SHORT={'CN':None}
pk=[k for k in peaks if country.get(k)]
pk.sort(key=lambda k:-country[k][1])
out=[]; i=0
for rank,iso in enumerate(pk):
    c=country[iso][0]; p=peaks[iso][0]
    others=[x for x in pk if x!=iso and peaks[x][0]['fr']!=p['fr']]
    random.shuffle(others)
    dis=[peaks[x][0] for x in others[:3]]
    qq={'fr':f"{c['fr']} : quel est son plus haut sommet ?",'en':f"{c['en']}: what is its highest peak?",'es':f"{c['es']}: ¿cuál es su pico más alto?",'ar':f"{c['ar']}: ما أعلى قمة فيها؟"}
    t=1 if rank<14 else 2 if rank<30 else 3
    t={'MA':1,'TZ':1,'NP':1,'KE':2,'DZ':1,'EG':1,'TN':2}.get(iso,t)  # sommets que tout le monde connaît ici
    out.append(mk('peaks',i,t,qq,p,dis,'🏔️')); i+=1
# Capitales au bord d'un cours d'eau (un seul, le plus connu)
CAPRIV={'FR':'Seine','GB':'Tamise','IT':'Tibre','DE':'Spree','RU':'Moskova','US':'Potomac','ES':'Manzanares','EG':'Nil','PL':'Vistule','UA':'Dniepr','CH':'Aar','AT':'Danube','HU':'Danube','PT':'Tage','AR':'río de la Plata','VN':'fleuve Rouge','TH':'Chao Phraya','KR':'Han','CZ':'Vltava','IQ':'Tigre','IE':'Liffey','LV':'Daugava','SD':'Nil','CD':'Congo','KH':'Mékong','LA':'Mékong','ML':'Niger','NE':'Niger','PY':'Paraguay','CA':'rivière des Outaouais','IN':'Yamunâ','SY':'Barada','HR':'Save','GE':'Koura','RO':'Dâmbovița','NL':'Amstel','TD':'Chari','CF':'Oubangui','GM':'Gambie','LI':'Rhin','RS':'Danube','SK':'Danube','UY':'río de la Plata','LT':'Néris','KP':'Taedong','MK':'Vardar','BG':'Iskar','CL':'Mapocho','SS':'Nil','AF':'Kaboul','CG':'Congo','SR':'Suriname'}
cr={}; allriv={}; near={}
for r in d1['caprivers']:
    iso=r['iso']; n=nm(r,'r')
    if n: allriv[n['fr']]=n
    near.setdefault(iso,set()).add(r.get('r_fr'))
    if iso in CAPRIV and n and n['fr']==CAPRIV[iso] and nm(r,'city'): cr[iso]=(nm(r,'city'),n,int(r['links']))
CONT={}
for r in peaks_rows: pass
isos=sorted(cr,key=lambda k:-cr[k][2])
riv_names=sorted(allriv)
for rank,iso in enumerate(isos):
    city,riv,_=cr[iso]
    # Faux choix : les cours d'eau des autres capitales (connus), jamais un autre bras du même fleuve.
    main={cr[k][1]['fr']:cr[k][1] for k in cr}
    cand=[v for x,v in main.items() if x not in near[iso] and x!=riv['fr'] and not (x.startswith('Nil') and riv['fr'].startswith('Nil'))]
    random.shuffle(cand)
    qq={'fr':f"{city['fr']} : au bord de quel cours d'eau se trouve cette capitale ?",'en':f"{city['en']}: which river does this capital stand on?",'es':f"{city['es']}: ¿a orillas de qué río está esta capital?",'ar':f"{city['ar']}: على ضفاف أي نهر تقع هذه العاصمة؟"}
    t=1 if rank<15 else 2 if rank<32 else 3
    out.append(mk('peaks',i,t,qq,riv,cand[:3],'🌊')); i+=1
packs['peaks']=out

# ------------------------------------------------------------------ records
def best(rows,key,idk,var):
    m={}
    for r in rows:
        if not nm(r,var): continue
        v=float(r[key]); k=r[idk]
        if k not in m or v>m[k][1]: m[k]=(nm(r,var),v,int(r['links']))
    return list(m.values())
RIVERS_OK=['Nil','Yangzi Jiang','fleuve Jaune','Paraná','Congo','Mékong','Léna','Niger','Mississippi','Volga','Indus','Danube','Zambèze','Gange','Euphrate','Rhin','Loire','Elbe','Tage','Dniepr','Orénoque','Sénégal','Orange','Limpopo','Tigre','Saint-Laurent']
rivs={x[0]['fr']:x for x in best(d1['rivers'],'len','r','r') if x[0]['fr'] in RIVERS_OK}
LAKES_OK=['mer Caspienne','lac Supérieur','lac Victoria','lac Huron','lac Michigan','lac Tanganyika','lac Baïkal','lac Malawi','lac Érié','lac Ontario','lac Ladoga','lac Titicaca','lac Nicaragua','lac Turkana','Yssyk Koul','Vänern','lac Kivu','lac Tana','lac Onega','lac Balkhach','lac de Van','lac Léman','lac de Constance']
lakes={x[0]['fr']:x for x in best(d1['lakes'],'area','l','l') if x[0]['fr'] in LAKES_OK}
print('fleuves',len(rivs),sorted(set(RIVERS_OK)-set(rivs)),'lacs',len(lakes),sorted(set(LAKES_OK)-set(lakes)))
rec=[]; j=0
def compare(pool,n,qq,emoji,tierf,minratio=1.15):
    global j
    items=list(pool.values()); made=0; seen=set()
    tries=0
    while made<n and tries<5000:
        tries+=1
        s=random.sample(items,4); s.sort(key=lambda x:-x[1])
        if s[0][1] < s[1][1]*minratio: continue
        key=tuple(sorted(x[0]['fr'] for x in s))
        if key in seen or s[0][0]['fr'] in [k[0] for k in seen if False]: continue
        seen.add(key)
        dis=s[1:]; random.shuffle(dis)
        rec.append(mk('records',j,tierf(s),qq,s[0][0],[x[0] for x in dis],emoji)); j+=1; made+=1
fame=lambda s: 2
compare(rivs,16,{'fr':'Lequel de ces fleuves est le plus long ?','en':'Which of these rivers is the longest?','es':'¿Cuál de estos ríos es el más largo?','ar':'أي هذه الأنهار هو الأطول؟'},'🌊',fame)
compare(lakes,12,{'fr':'Lequel de ces lacs est le plus grand (en superficie) ?','en':'Which of these lakes is the largest (by area)?','es':'¿Cuál de estos lagos es el más grande (en superficie)?','ar':'أي هذه البحيرات هي الأكبر مساحةً؟'},'💧',lambda s: 3,1.25)
pk_pool={peaks[k][0]['fr']:(peaks[k][0],peaks[k][1],country[k][1]) for k in pk if peaks[k][1]>0 and k not in ('CN',)}
compare(pk_pool,14,{'fr':'Lequel de ces sommets est le plus haut ?','en':'Which of these peaks is the highest?','es':'¿Cuál de estas cumbres es la más alta?','ar':'أي هذه القمم هي الأعلى؟'},'🏔️',lambda s: 1 if s[0][1]>8000 else 2,1.12)
# Superlatifs connus, réponses et noms vérifiés dans Wikidata (longueurs, superficies, altitudes ci-dessus)
def N(fr,en,es,ar): return {'fr':fr,'en':en,'es':es,'ar':ar}
R=lambda k: rivs[k][0]; LK=lambda k: lakes[k][0]
SUP=[
 (1,N("Quel est le plus long fleuve d'Afrique ?","What is the longest river in Africa?","¿Cuál es el río más largo de África?","ما أطول نهر في أفريقيا؟"),R('Nil'),[R('Congo'),R('Niger'),R('Zambèze')],'🌍'),
 (1,N("Quel est le plus long fleuve d'Asie ?","What is the longest river in Asia?","¿Cuál es el río más largo de Asia?","ما أطول نهر في آسيا؟"),R('Yangzi Jiang'),[R('fleuve Jaune'),R('Mékong'),R('Gange')],'🌏'),
 (2,N("Quel est le plus long fleuve d'Europe ?","What is the longest river in Europe?","¿Cuál es el río más largo de Europa?","ما أطول نهر في أوروبا؟"),R('Volga'),[R('Danube'),R('Rhin'),R('Dniepr')],'🌍'),
 (1,N("Quel est le plus grand lac du monde ?","What is the largest lake in the world?","¿Cuál es el lago más grande del mundo?","ما أكبر بحيرة في العالم؟"),LK('mer Caspienne'),[LK('lac Supérieur'),LK('lac Victoria'),LK('lac Baïkal')],'💧'),
 (2,N("Quel est le lac le plus profond du monde ?","What is the deepest lake in the world?","¿Cuál es el lago más profundo del mundo?","ما أعمق بحيرة في العالم؟"),LK('lac Baïkal'),[LK('lac Tanganyika'),LK('lac Malawi'),LK('lac Titicaca')],'💧'),
 (1,N("Quel est le plus grand lac d'Afrique ?","What is the largest lake in Africa?","¿Cuál es el lago más grande de África?","ما أكبر بحيرة في أفريقيا؟"),LK('lac Victoria'),[LK('lac Tanganyika'),LK('lac Malawi'),LK('lac Turkana')],'💧'),
 (2,N("Quel est le plus haut sommet d'Afrique ?","What is the highest mountain in Africa?","¿Cuál es la montaña más alta de África?","ما أعلى قمة في أفريقيا؟"),peaks['TZ'][0],[peaks['KE'][0],peaks['MA'][0],peaks['CM'][0]],'🏔️'),
 (2,N("Quel est le plus haut sommet des Amériques ?","What is the highest mountain in the Americas?","¿Cuál es la montaña más alta de América?","ما أعلى قمة في الأمريكتين؟"),peaks['AR'][0],[peaks['US'][0],peaks['EC'][0],peaks['PE'][0]],'🏔️'),
 (1,N("Quel est le plus haut sommet d'Afrique du Nord ?","What is the highest peak in North Africa?","¿Cuál es la cumbre más alta del norte de África?","ما أعلى قمة في شمال أفريقيا؟"),peaks['MA'][0],[peaks['DZ'][0],peaks['TN'][0],peaks['EG'][0]],'🇲🇦'),
 (1,N("Quel est le plus haut sommet du monde ?","What is the highest mountain in the world?","¿Cuál es la montaña más alta del mundo?","ما أعلى قمة في العالم؟"),peaks['NP'][0],[peaks['PK'][0],peaks['IN'][0],peaks['AR'][0]],'🏔️'),
 (1,N("Quel est le plus grand désert chaud du monde ?","What is the largest hot desert in the world?","¿Cuál es el desierto cálido más grande del mundo?","ما أكبر صحراء حارة في العالم؟"),N('le Sahara','the Sahara','el Sahara','الصحراء الكبرى'),[N('le Kalahari','the Kalahari','el Kalahari','صحراء كالاهاري'),N('le désert de Gobi','the Gobi Desert','el desierto de Gobi','صحراء غوبي'),N("le désert d'Atacama",'the Atacama Desert','el desierto de Atacama','صحراء أتاكاما')],'🏜️'),
 (1,N("Quel est le plus grand océan ?","What is the largest ocean?","¿Cuál es el océano más grande?","ما أكبر محيط؟"),N("l'océan Pacifique",'the Pacific Ocean','el océano Pacífico','المحيط الهادئ'),[N("l'océan Atlantique",'the Atlantic Ocean','el océano Atlántico','المحيط الأطلسي'),N("l'océan Indien",'the Indian Ocean','el océano Índico','المحيط الهندي'),N("l'océan Arctique",'the Arctic Ocean','el océano Ártico','المحيط المتجمد الشمالي')],'🌊'),
 (1,N("Quelle est la plus grande île du monde ?","What is the largest island in the world?","¿Cuál es la isla más grande del mundo?","ما أكبر جزيرة في العالم؟"),N('le Groenland','Greenland','Groenlandia','غرينلاند'),[N('Madagascar','Madagascar','Madagascar','مدغشقر'),N('Bornéo','Borneo','Borneo','بورنيو'),N('la Nouvelle-Guinée','New Guinea','Nueva Guinea','غينيا الجديدة')],'🏝️'),
 (1,N("Quel est le plus grand pays du monde ?","What is the largest country in the world?","¿Cuál es el país más grande del mundo?","ما أكبر دولة في العالم مساحةً؟"),N('la Russie','Russia','Rusia','روسيا'),[N('le Canada','Canada','Canadá','كندا'),N('la Chine','China','China','الصين'),N('les États-Unis','the United States','Estados Unidos','الولايات المتحدة')],'🗺️'),
 (1,N("Quel est le plus petit pays du monde ?","What is the smallest country in the world?","¿Cuál es el país más pequeño del mundo?","ما أصغر دولة في العالم؟"),N('le Vatican','Vatican City','el Vaticano','الفاتيكان'),[N('Monaco','Monaco','Mónaco','موناكو'),N('Saint-Marin','San Marino','San Marino','سان مارينو'),N('le Liechtenstein','Liechtenstein','Liechtenstein','ليختنشتاين')],'🗺️'),
 (2,N("Quel est le plus grand pays d'Afrique ?","What is the largest country in Africa?","¿Cuál es el país más grande de África?","ما أكبر دولة في أفريقيا مساحةً؟"),N("l'Algérie",'Algeria','Argelia','الجزائر'),[N('la République démocratique du Congo','the Democratic Republic of the Congo','la República Democrática del Congo','جمهورية الكونغو الديمقراطية'),N('le Soudan','Sudan','Sudán','السودان'),N('la Libye','Libya','Libia','ليبيا')],'🌍'),
 (2,N("Quelle est la plus haute chute d'eau du monde ?","What is the highest waterfall in the world?","¿Cuál es la cascada más alta del mundo?","ما أعلى شلال في العالم؟"),N('le Salto Ángel (Venezuela)','Angel Falls (Venezuela)','el Salto Ángel (Venezuela)','شلال سالتو آنخل (فنزويلا)'),[N('les chutes du Niagara','Niagara Falls','las cataratas del Niágara','شلالات نياغارا'),N('les chutes Victoria','Victoria Falls','las cataratas Victoria','شلالات فيكتوريا'),N("les chutes d'Iguaçu",'Iguazu Falls','las cataratas del Iguazú','شلالات إجوازو')],'💦'),
 (2,N("Quel est l'endroit le plus profond des océans ?","What is the deepest place in the oceans?","¿Cuál es el lugar más profundo de los océanos?","ما أعمق نقطة في المحيطات؟"),N('la fosse des Mariannes','the Mariana Trench','la fosa de las Marianas','خندق ماريانا'),[N('la fosse de Porto Rico','the Puerto Rico Trench','la fosa de Puerto Rico','خندق بورتوريكو'),N('la fosse des Kouriles','the Kuril Trench','la fosa de las Kuriles','خندق الكوريل'),N('la fosse du Japon','the Japan Trench','la fosa de Japón','خندق اليابان')],'🌊'),
 (1,N("Quel est le plus grand continent ?","What is the largest continent?","¿Cuál es el continente más grande?","ما أكبر قارة؟"),N("l'Asie",'Asia','Asia','آسيا'),[N("l'Afrique",'Africa','África','أفريقيا'),N("l'Amérique du Nord",'North America','América del Norte','أمريكا الشمالية'),N("l'Europe",'Europe','Europa','أوروبا')],'🌏'),
 (3,N("Quel est le désert le plus sec du monde (hors pôles) ?","What is the driest desert in the world (outside the poles)?","¿Cuál es el desierto más seco del mundo (fuera de los polos)?","ما أشد الصحارى جفافًا في العالم (عدا القطبين)؟"),N("le désert d'Atacama",'the Atacama Desert','el desierto de Atacama','صحراء أتاكاما'),[N('le Sahara','the Sahara','el Sahara','الصحراء الكبرى'),N('le désert de Gobi','the Gobi Desert','el desierto de Gobi','صحراء غوبي'),N('le désert du Namib','the Namib Desert','el desierto de Namib','صحراء ناميب')],'🏜️'),
]
for t,qq,a,dis,e in SUP: rec.append(mk('records',j,t,qq,a,dis,e)); j+=1
packs['records']=rec

# ------------------------------------------------------------------ inventeurs et découvertes
d2=json.load(open('fetch2.json'))
inv={}
for r in d2['inv']:
    p=nm(r,'p')
    if p and r.get('i_fr'): inv.setdefault(r['i_fr'],{})[p['fr']]=p
WANT={'presse typographique':'Johannes Gutenberg','dynamite':'Alfred Nobel','pénicilline':'Alexandre Fleming','vaccin':'Edward Jenner','radioactivité':'Henri Becquerel','rayon X':'Wilhelm Röntgen','code Morse':'Samuel Morse','phonographe':'Thomas Edison','saxophone':'Adolphe Sax','moteur Diesel':'Rudolf Diesel',"Rubik’s Cube":'Ernő Rubik','judo':'Jigorō Kanō','basket-ball':'James Naismith','volley-ball':'William G. Morgan','navigateur web':'Tim Berners-Lee','tableau périodique des éléments':'Dmitri Mendeleïev','stéthoscope':'René Laennec','paratonnerre':'Benjamin Franklin','pasteurisation':'Louis Pasteur','théorie de la relativité':'Albert Einstein','gravitation':'Isaac Newton','baromètre':'Evangelista Torricelli','pile électrique':'Alessandro Volta','papier':'Cai Lun','téléphone mobile':'Martin Cooper','courrier électronique':'Ray Tomlinson','souris':'Douglas Engelbart','espéranto':'Louis-Lazare Zamenhof','fermeture éclair':'Whitcomb Judson','aspirateur':'Hubert Cecil Booth','Barbie':'Ruth Handler','LEGO':'Ole Kirk Christiansen','code QR':'Masahiro Hara','Uranus':'William Herschel','Pluton':'Clyde William Tombaugh','électron':'Joseph John Thomson','neutron':'James Chadwick','pôle Sud':'Roald Amundsen','induction électromagnétique':'Michael Faraday','gyroscope':'Léon Foucault','datation par le carbone 14':'Willard Frank Libby','effet Doppler':'Christian Doppler','logarithme':'John Napier','groupe sanguin':'Karl Landsteiner','synthétiseur':'Robert Moog','Io':'Galilée','vélo':'Karl Drais','machine de Turing':'Alan Turing','sudoku':'Howard Garns'}
people={k:inv[k][v] for k,v in WANT.items()}
allp=list({p['fr']:p for p in people.values()}.values())
iv=[]; k=0
for lab,typ,tier,*xs in ITEMS:
    who=people[lab]; x=dict(zip(L,xs))
    others=[p for p in allp if p['fr']!=who['fr'] and p['fr'] not in inv.get(lab,{})]
    random.shuffle(others)
    qq={l:Q[typ][n].replace('{x}',x[l]) for n,l in enumerate(L)}
    iv.append(mk('inventions',k,tier,qq,who,others[:3],'💡')); k+=1
# Fondatrice de la Qaraouiyine (Fès, 859) : fait historique établi
N2=lambda fr,en,es,ar: {'fr':fr,'en':en,'es':es,'ar':ar}
iv.append(mk('inventions',k,1,N2("Qui a fondé l'université Al Quaraouiyine à Fès, en 859 ?","Who founded the University of al-Qarawiyyin in Fez in 859?","¿Quién fundó la Universidad de al-Qarawiyyin en Fez en el año 859?","من أسّس جامعة القرويين بفاس سنة 859؟"),N2('Fatima al-Fihriya','Fatima al-Fihri','Fátima al-Fihri','فاطمة الفهرية'),[N2('Ibn Battûta','Ibn Battuta','Ibn Battuta','ابن بطوطة'),N2('Al-Idrissi','al-Idrisi','al-Idrisi','الإدريسي'),N2('Ibn Khaldoun','Ibn Khaldun','Ibn Jaldún','ابن خلدون')],'🏛️')); k+=1
packs['inventions']=iv

# ------------------------------------------------------------------ sportifs africains
d3=json.load(open('fetch3.json'))
P={}; SP={}
for src in (d2['ath'],d3['afr'],d3['ma']):
    for r in src:
        p=nm(r,'p'); s=nm(r,'s')
        if not p: continue
        e=P.setdefault(p['fr'],{'p':p,'links':int(r['links']),'iso':set(),'sp':{}})
        if r.get('iso'): e['iso'].add(r['iso'])
        if s: e['sp'][s['fr']]=s; SP[s['fr']]=s
FOOT={'Mohamed Salah':'EG','George Weah':'LR','Didier Drogba':'CI','Sadio Mané':'SN',"Samuel Eto'o":'CM','Riyad Mahrez':'DZ','Yaya Touré':'CI','Achraf Hakimi':'MA','Pierre-Emerick Aubameyang':'GA','Emmanuel Adebayor':'TG','Michael Essien':'GH','Roger Milla':'CM','Yassine Bounou':'MA','Hakim Ziyech':'MA','Medhi Benatia':'MA','Kalidou Koulibaly':'SN','Nwankwo Kanu':'NG','Jay-Jay Okocha':'NG','Abedi Pelé':'GH','Victor Osimhen':'NG','Sofyan Amrabat':'MA','Youssef En-Nesyri':'MA','Noussair Mazraoui':'MA','El-Hadji Diouf':'SN','Seydou Keita':'ML','Frédéric Kanouté':'ML','Essam el-Hadary':'EG','Islam Slimani':'DZ','Wahbi Khazri':'TN','Azzedine Ounahi':'MA','Nayef Aguerd':'MA','Romain Ghanem Saïss':'MA','Thomas Partey':'GH','Édouard Mendy':'SN'}
OTHER={'Hicham El Guerrouj':'athlétisme','Nawal El Moutawakel':'athlétisme','Saïd Aouita':'athlétisme','Soufiane el-Bakkali':'athlétisme','Badr Hari':'kick-boxing','Younès El Aynaoui':'tennis','Hicham Arazi':'tennis','Haile Gebrselassie':'athlétisme','Abebe Bikila':'athlétisme','Eliud Kipchoge':'athlétisme','Kenenisa Bekele':'athlétisme','David Rudisha':'athlétisme','Kirsty Coventry':'natation sportive','Ons Jabeur':'tennis','Dikembe Mutombo':'basket-ball','Joel Embiid':'basket-ball','Pascal Siakam':'basket-ball','Serge Ibaka':'basket-ball','Francis Ngannou':'arts martiaux mixtes','Israel Adesanya':'arts martiaux mixtes','Imane Khelif':'boxe','Gary Player':'golf','Clarisse Agbegnenou':'judo','Jody Scheckter':'course automobile','Yannick Noah':'tennis','Jo-Wilfried Tsonga':'tennis','Hassiba Boulmerka':'athlétisme','Noureddine Morceli':'athlétisme','Faith Kipyegon':'athlétisme','Wayde van Niekerk':'athlétisme','Letsile Tebogo':'athlétisme','Manute Bol':'basket-ball','Luol Deng':'basket-ball','Tatjana Schoenmaker':'natation sportive','Kipchoge Keino':'athlétisme'}
COUNTRY_Q={'Hicham El Guerrouj':'MA','Haile Gebrselassie':'ET','Eliud Kipchoge':'KE','Ons Jabeur':'TN','Kirsty Coventry':'ZW','Dikembe Mutombo':'CD','Noureddine Morceli':'DZ','Abebe Bikila':'ET','Letsile Tebogo':'BW','Gary Player':'ZA','Nawal El Moutawakel':'MA','Kipchoge Keino':'KE'}
cn={k:v[0] for k,v in country.items() if v}
AFR=[k for k in 'MA DZ TN EG SN CI CM NG GH KE ET ZA ML GA TG LR CD ZW BW SD UG TZ ZM AO MZ'.split() if k in cn]
sp_out=[]; m=0
missing=[x for x in list(FOOT)+list(OTHER) if x not in P]
print('sportifs manquants',missing)
def country_q(name,iso,tier,emoji):
    global m
    p=P[name]['p']
    others=[c for c in AFR if c!=iso]; random.shuffle(others)
    qq={'fr':f"Pour quel pays a brillé {p['fr']} ?",'en':f"Which country did {p['en']} represent?",'es':f"¿A qué país representó {p['es']}?",'ar':f"من أي بلد {p['ar']}؟"}
    sp_out.append(mk('afrisport',m,tier,qq,cn[iso],[cn[c] for c in others[:3]],emoji)); m+=1
tier=lambda name: 1 if P[name]['links']>=70 or P[name]['iso']=={'MA'} and P[name]['links']>=48 else 2 if P[name]['links']>=45 else 3
for name,iso in FOOT.items():
    if name in P and iso in P[name]['iso']: country_q(name,iso,tier(name),'⚽')
    else: print('ignoré',name)
for name,s in OTHER.items():
    if name not in P or s not in P[name]['sp']: print('ignoré sport',name); continue
    p=P[name]['p']; ans=SP[s]
    others=[SP[x] for x in SP if x!=s and x not in P[name]['sp'] and x in set(OTHER.values())|{'football'}]
    random.shuffle(others)
    qq={'fr':f"Dans quel sport s'est illustré(e) {p['fr']} ?",'en':f"In which sport did {p['en']} make a name?",'es':f"¿En qué deporte destacó {p['es']}?",'ar':f"في أي رياضة تألّق/تألّقت {p['ar']}؟"}
    sp_out.append(mk('afrisport',m,tier(name),qq,ans,others[:3],'🏅')); m+=1
for name,iso in COUNTRY_Q.items():
    if name in P and iso in P[name]['iso']: country_q(name,iso,tier(name),'🏅')
    else: print('ignoré pays',name)
packs['afrisport']=sp_out
for k,v in packs.items(): print(k,len(v),{t:sum(1 for x in v if x['tier']==t) for t in (1,2,3)})
s_=json.dumps(packs,ensure_ascii=False).replace('مون بلون','مون بلان'); packs=json.loads(s_)
json.dump(packs,open('new_packs.json','w'),ensure_ascii=False,indent=1)
