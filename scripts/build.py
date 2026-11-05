"""Construye los datos de cada barómetro del CEO con ponderación por recuerdo de voto."""
import pyreadstat, glob, re, json, math, sys, os
import numpy as np, pandas as pd

SRC = '/mnt/user-data/uploads/CEO/Cuestionarios'
OUT = '/tmp/claude-0/w/site'

# ---------------------------------------------------------------- elecciones
# Resultados oficiales Parlament de Catalunya (censo total, incluye CERA)
ELEC = {
 '2015': dict(nombre='Parlament 2015', fecha='2015-09-27', censo=5510853, votantes=4130196,
   partidos=[('JxSí',1628714),('Cs',736364),('PSC',523283),('CSQEP',367613),('PP',349193),('CUP',337794)],
   mapa={15:'JxSí',3:'JxSí',14:'JxSí',17:'JxSí',6:'Cs',4:'PSC',16:'CSQEP',5:'CSQEP',12:'CSQEP',13:'CSQEP',18:'CSQEP',1:'PP',10:'CUP'}),
 '2017': dict(nombre='Parlament 2017', fecha='2017-12-21', censo=5554455, votantes=4392891,
   partidos=[('Cs',1109732),('JxCat',948233),('ERC',935861),('PSC',606659),('CatComú-Podem',326360),('CUP',195246),('PP',185670)],
   mapa={6:'Cs',21:'JxCat',20:'JxCat',14:'JxCat',15:'JxCat',2:'JxCat',3:'ERC',4:'PSC',22:'CatComú-Podem',5:'CatComú-Podem',12:'CatComú-Podem',13:'CatComú-Podem',18:'CatComú-Podem',1:'PP',10:'CUP'}),
 '2021': dict(nombre='Parlament 2021', fecha='2021-02-14', censo=5624067, votantes=2884845,
   partidos=[('PSC',654766),('ERC',605581),('JxCat',570539),('Vox',218121),('ECP',195345),('CUP',189924),('Cs',158606),('PP',109452),('PDeCAT',77229)],
   mapa={4:'PSC',3:'ERC',21:'JxCat',23:'Vox',22:'ECP',18:'ECP',5:'ECP',12:'ECP',13:'ECP',10:'CUP',6:'Cs',1:'PP',20:'PDeCAT',2:'PDeCAT',14:'PDeCAT'}),
 '2024': dict(nombre='Parlament 2024', fecha='2024-05-12', censo=5754952, votantes=3183137,
   partidos=[('PSC',882589),('Junts',681470),('ERC',431128),('PP',347170),('Vox',251096),('Comuns Sumar',184297),('CUP',129059),('Aliança Catalana',119149)],
   mapa={4:'PSC',21:'Junts',20:'Junts',2:'Junts',14:'Junts',3:'ERC',1:'PP',23:'Vox',18:'Comuns Sumar',22:'Comuns Sumar',24:'Comuns Sumar',12:'Comuns Sumar',5:'Comuns Sumar',13:'Comuns Sumar',10:'CUP',25:'Aliança Catalana'}),
}
OTROS, ABST, NOP, NSNC = 'Otros, blanco y nulo', 'Abstención', 'No podía votar', 'NS/NC'

def eleccion_ref(y, m):
    d = y*100+m
    if d < 201712: return '2015'
    if d < 202102: return '2017'
    if d < 202405 or (y == 2024 and m < 5): return '2021'
    return '2024'

ONADA = {}
for d in os.listdir('/mnt/user-data/uploads/CEO') if False else []: pass

SKIP = re.compile(r'^(ORDRE|ORDRECINE|ORDRE_CINE|NUM_QUEST|HORA|DATA_|DIA$|DURADA|ENQUESTADOR|SECCIO|ID_RUTA|MUNICIPI|CONF_SECC|REO$|BOP_NUM|ANY$|MES$|GRAVACIO|TIPUS_GRAV|PONDERA|CIRCUIT|SUPERVISADA|FASE$|SEXE_\d|EDAT_\d|P77_SEXE|P77_EDAT|.*_ENQUESTADOR|.*_enq$)|LITERAL', re.I)
NSNC_RE = re.compile(r"(no ho sap|no contesta|no sap|^ns\s*/?\s*nc|no sabe|no contesta)", re.I)

def recode_age(e):
    if pd.isna(e): return np.nan
    for i, (a, b) in enumerate([(16, 24), (25, 34), (35, 49), (50, 64), (65, 200)]):
        if a <= e <= b: return i
    return np.nan

def rake(w0, margins, iters=200, lo=0.2, hi=5.0):
    """margins: list of (codes array (np.int), {code: target_share})"""
    w = w0.copy()
    for it in range(iters):
        maxdev = 0
        for codes, tgt in margins:
            tot = w.sum()
            for c, t in tgt.items():
                m = codes == c
                cur = w[m].sum() / tot
                if cur > 0:
                    f = t / cur
                    w[m] *= f
                    maxdev = max(maxdev, abs(f-1))
        # recorte
        w = w / w.mean()
        w = np.clip(w, lo, hi)
        if maxdev < 1e-5: break
    return w / w.mean()

ALPH = ''.join(chr(c) for c in range(35, 127) if chr(c) not in '\\')  # sin " ni \

def find(cols, labels, pat_name=None, pat_lab=None, excl=None):
    for c in cols:
        l = labels.get(c) or ''
        if pat_name and not re.search(pat_name, c, re.I): continue
        if pat_lab and not re.search(pat_lab, l, re.I): continue
        if excl and re.search(excl, c + ' ' + l, re.I): continue
        return c
    return None

def build(path):
    sid = re.findall(r'(\d{3,4})\.sav', path)[0]
    df, meta = pyreadstat.read_sav(path)
    cols = meta.column_names
    L = meta.column_names_to_labels
    VL = meta.variable_value_labels
    N = len(df)
    y = int(df['ANY'].mode()[0]); y = y + 2000 if y < 100 else y
    m = int(df['MES'].mode()[0])
    ref = eleccion_ref(y, m)
    E = ELEC[ref]

    # ---- variables clave
    K = {}
    K['sexo'] = find(cols, L, r'^SEXE$')
    K['edad_gr'] = find(cols, L, r'^(GR_EDAT|EDAT_GR)$')
    K['edad'] = find(cols, L, r'^EDAT$')
    K['provincia'] = find(cols, L, r'^PROV')
    K['habitat'] = find(cols, L, r'^HABITAT$')
    K['rec_cens'] = find(cols, L, r'(^P\d+B?_CENS$|^REC_PARLAMENT_VOT_CENS$)')
    K['int_parlament'] = find(cols, L, r'R$', r'(Parlament de Catalunya.*votaria|Intenci. al Parlament)', r'Congr|VOT2|_UE|EUROP')
    K['int_congres'] = find(cols, L, r'R$', r'Congr.s.*votaria', r'VOT2|record|va votar')
    K['rec_congres'] = find(cols, L, r'CENS_?R$|_CENS_R$|CENSR$', r'Congr|Generals', r'Parlament de Cat')
    K['ideologia'] = find(cols, L, None, r'(esquerra.*dreta|esquerra i dreta)', r'(PPC|ERC|PSC|PARE|MARE|_[A-Z]$|P26|partit)')
    K['independencia'] = find(cols, L, None, r'Vol que Catalunya esdevingui un Estat independent')
    def findval(pat, excl=None):
        for c in cols:
            vl = ' | '.join(str(x) for x in (VL.get(c) or {}).values())
            if re.search(pat, vl, re.I) and not (excl and re.search(excl, c, re.I)): return c
    K['sentimiento'] = findval(r'^(?=.*Nom.s espanyol)(?=.*M.s espanyol/a que catal)', r'_R$|LITERAL|^P81')
    K['relacion_cat_esp'] = findval(r'comunitat aut.noma.*estat independent|estat independent.*comunitat aut.noma', r'LITERAL')
    K['lengua_propia'] = find(cols, L, None, r'llengua.*(pr.pia|considera)', r'ALTRES|LITERAL')
    K['simpatia'] = find(cols, L, r'R$', r'simpatia', r'LITERAL|PROPER')
    K = {k: v for k, v in K.items() if v}

    # ---- recuerdo agrupado
    rc = df[K['rec_cens']]
    def grp(v):
        if pd.isna(v): return NSNC
        v = int(v)
        if v in E['mapa']: return E['mapa'][v]
        if v == 96: return ABST
        if v == 97: return NOP
        if v in (98, 99): return NSNC
        return OTROS
    rec = rc.map(grp)
    party_names = [p for p, _ in E['partidos']]
    rec_cats = party_names + [OTROS, ABST, NSNC, NOP]
    rec_codes = rec.map({c: i for i, c in enumerate(rec_cats)}).to_numpy()

    # objetivos sobre censo
    w0 = df['PONDERA'].fillna(1).to_numpy(float) if 'PONDERA' in df else np.ones(N)
    w0 = w0 / w0.mean()
    sh = lambda codes, c: w0[codes == c].sum() / w0.sum()
    fixed = sh(rec_codes, rec_cats.index(NSNC)) + sh(rec_codes, rec_cats.index(NOP))
    resto = 1 - fixed
    cen = E['censo']
    off = {p: v/cen for p, v in E['partidos']}
    off[OTROS] = (E['votantes'] - sum(v for _, v in E['partidos'])) / cen
    off[ABST] = (cen - E['votantes']) / cen
    tgt_rec = {rec_cats.index(k): v*resto for k, v in off.items()}
    tgt_rec[rec_cats.index(NSNC)] = sh(rec_codes, rec_cats.index(NSNC))
    tgt_rec[rec_cats.index(NOP)] = sh(rec_codes, rec_cats.index(NOP))
    tgt_rec = {k: v for k, v in tgt_rec.items() if (rec_codes == k).any()}
    s = sum(tgt_rec.values()); tgt_rec = {k: v/s for k, v in tgt_rec.items()}

    margins = []
    for kk in ['sexo', 'edad_gr', 'provincia']:
        if kk in K:
            c = df[K[kk]].fillna(-1).astype(int).to_numpy()
            margins.append((c, {v: sh(c, v) for v in np.unique(c)}))
    margins.append((rec_codes, tgt_rec))
    w = rake(w0, margins)
    kish = w.sum()**2 / (w**2).sum()

    diag = []
    for i, c in enumerate(rec_cats):
        msk = rec_codes == i
        diag.append(dict(cat=c, n=int(msk.sum()), muestra=round(100*sh(rec_codes, i), 2),
                         objetivo=round(100*tgt_rec.get(i, 0), 2), ponderado=round(100*w[msk].sum()/w.sum(), 2),
                         oficial_censo=round(100*off.get(c, 0), 2) if c in off else None,
                         peso_medio=round(float(w[msk].mean()), 3) if msk.any() else None))

    # ---- variables
    vars_out = []
    def enc_cat(name, series, labels_map, label, extra=None):
        vals = series.dropna().unique()
        codes = sorted(set([float(v) for v in vals]))
        if len(codes) < 2 or len(codes) > 60: return None
        lab = {float(k): str(v) for k, v in (labels_map or {}).items()}
        cats = []
        for c in codes:
            lb = lab.get(c, (str(int(c)) if float(c).is_integer() else str(c)))
            cats.append([int(c) if float(c).is_integer() else c, lb, 1 if NSNC_RE.search(lb) else 0])
        idx = {c: i for i, c in enumerate(codes)}
        s = ''.join(' ' if pd.isna(v) else ALPH[idx[float(v)]] for v in series)
        is_scale = bool(re.search(r'0_10', name) or re.search(r'0[ _-]10', label)) or \
            (sum(1 for c in codes if 0 <= c <= 10) >= 9 and all((0 <= c <= 10) or c >= 90 for c in codes))
        d = dict(n=name, l=label, t='scale' if is_scale else 'cat', c=cats, d=s)
        if extra: d.update(extra)
        return d

    # derivada: recuerdo agrupado
    vars_out.append(dict(n='REC_AGRUPADO', l=f'Recuerdo de voto {E["nombre"]} (agrupado para ponderar)', t='cat',
        c=[[i, c, 1 if c == NSNC else 0] for i, c in enumerate(rec_cats)],
        d=''.join(ALPH[i] for i in rec_codes), derived=1))
    if 'edad' in K:
        ag = df[K['edad']].map(recode_age)
        v = enc_cat('EDAD_5GR', ag, {0: '16-24', 1: '25-34', 2: '35-49', 3: '50-64', 4: '65 y más'}, 'Edad en 5 grupos (derivada)', {'derived': 1})
        if v: vars_out.append(v)

    nums = []
    for c in cols:
        if SKIP.search(c): continue
        s = df[c]
        if s.dtype == object: continue
        if s.notna().sum() < 20: continue
        lab = L.get(c) or c
        vl = VL.get(c)
        nun = s.nunique()
        if (not vl) and nun > 25:
            # numérica continua
            arr = [None if pd.isna(v) else (int(v) if float(v).is_integer() else round(float(v), 2)) for v in s]
            vars_out.append(dict(n=c, l=lab, t='num', v=arr))
            continue
        if nun == 1:
            # dummy de multirrespuesta: valor único = mencionado, vacío = no mencionado
            val = s.dropna().iloc[0]
            lb = (vl or {}).get(val, 'Mencionado')
            b = s.notna().astype(float)
            v = enc_cat(c, b, {0.0: 'No mencionado', 1.0: 'Mencionado' if NSNC_RE.search(str(lb)) is None else str(lb)}, lab, {'multi': 1})
        else:
            v = enc_cat(c, s, vl, lab)
        if v: vars_out.append(v)

    for v in vars_out:
        for k, kv in K.items():
            if v['n'] == kv: v['key'] = k

    # fechas de campo
    fecha = f'{y}-{m:02d}'
    info = dict(id=sid, anyo=y, mes=m, n=N, nvars=len(vars_out), ref=ref, eleccion=E['nombre'], eleccion_fecha=E['fecha'],
                claves=K, diag=diag, kish=round(kish, 1), wmin=round(float(w.min()), 3), wmax=round(float(w.max()), 3),
                pondera_constante=bool(np.allclose(w0, 1)))
    data = dict(info=info, w={'rec': [round(float(x), 4) for x in w], 'ceo': [round(float(x), 4) for x in w0]}, vars=vars_out, alph=ALPH)
    return data

if __name__ == '__main__':
    os.makedirs(OUT + '/data', exist_ok=True)
    files = sorted(glob.glob(SRC + '/*.sav'), key=lambda f: int(re.findall(r'(\d{3,4})\.sav', f)[0]))
    if len(sys.argv) > 1: files = [f for f in files if any(f.endswith(a + '.sav') for a in sys.argv[1:])]
    index = []
    for f in files:
        d = build(f)
        i = d['info']
        json.dump(d, open(f"{OUT}/data/{i['id']}.json", 'w'), ensure_ascii=False, separators=(',', ':'))
        index.append({k: i[k] for k in ['id', 'anyo', 'mes', 'n', 'nvars', 'ref', 'eleccion', 'kish', 'wmin', 'wmax', 'claves']})
        print(i['id'], i['anyo'], i['mes'], 'ref', i['ref'], 'N', i['n'], 'vars', i['nvars'], 'kish', i['kish'], 'w', i['wmin'], i['wmax'])
        print('   claves:', i['claves'])
        print('   ', ' | '.join(f"{r['cat']}: {r['muestra']}→{r['ponderado']} (obj {r['objetivo']})" for r in i['diag']))
    json.dump(index, open(f'{OUT}/data/index.json', 'w'), ensure_ascii=False, indent=0)
