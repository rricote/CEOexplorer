"""Precalcula la matriz de simpatía entre electorados de cada encuesta que la incluye (para la evolución temporal)."""
import json, glob, os, re
import numpy as np
SITE = '/tmp/claude-0/w/site'
ROWRE = [('PSC', r'PSC|PSOE'), ('ERC', r'^ERC'), ('CEC', r'Comuns|Comú|ECP|Sumar|Podem|CatComú'), ('JXCAT', r'Junts per Cat|JxCat|^Junts'),
         ('CUP', r'^CUP'), ('PP', r'^PPC?$|^PP\b'), ('VOX', r'^Vox'), ('ALIANCA', r'Aliança'), ('CS', r"^C's|^Cs\b|Ciutadans")]
OLA = json.load(open('/tmp/claude-0/w/ola.json')) if os.path.exists('/tmp/claude-0/w/ola.json') else {}


def rowcode(label):
    for c, rx in ROWRE:
        if re.search(rx, label, re.I): return c
    return None


def targets(vars_):
    out = {}
    for v in vars_:
        m = re.match(r'^SIMPATIA_VOTANTS_([A-Za-z]+)_0_10$', v['n'])
        if m: out[m.group(1).upper()] = (v, 'votantes'); continue
    if out: return out
    for v in vars_:
        m = re.match(r'^SIMPATIA_(PP|ERC|PSC|Cs|CUP|JXCAT|CEC|VOX|ALIANCA)_0_10$', v['n'], re.I)
        if m: out[m.group(1).upper()] = (v, 'partidos')
    return out


def dec(v, A):
    return np.array([-1 if ch == ' ' else A.index(ch) for ch in v['d']])


res = []
for f in sorted(glob.glob(SITE + '/data/[0-9]*.json'), key=lambda f: int(os.path.basename(f)[:-5])):
    d = json.load(open(f)); A = d['alph']; V = {v['n']: v for v in d['vars']}
    T = targets(d['vars'])
    if not T: continue
    tipo = list(T.values())[0][1]
    vals = {}
    for code, (v, _) in T.items():
        a = dec(v, A)
        vals[code] = np.array([v['c'][k][0] if k >= 0 and not v['c'][k][2] and isinstance(v['c'][k][0], (int, float)) and 0 <= v['c'][k][0] <= 10 else np.nan for k in a], float)
    out = {}
    for gname, gvar in [('int', d['info']['claves'].get('int_parlament')), ('rec', 'REC_AGRUPADO')]:
        gv = V[gvar]; ga = dec(gv, A)
        rows = {}
        for k, c in enumerate(gv['c']):
            rc = rowcode(c[1])
            if not rc: continue
            msk = ga == k
            rows.setdefault(rc, np.zeros(len(ga), bool)); rows[rc] |= msk
        for wname in ['rec', 'none']:
            w = np.array(d['w']['rec']) if wname == 'rec' else np.ones(len(ga))
            M = {}
            for rc, msk in rows.items():
                if msk.sum() == 0: continue
                M[rc] = {'n': int(msk.sum()), 'm': {}}
                for tc, x in vals.items():
                    mm = msk & ~np.isnan(x)
                    if mm.sum(): M[rc]['m'][tc] = round(float(np.average(x[mm], weights=w[mm])), 3)
            out[f'{gname}_{wname}'] = M
    i = d['info']
    res.append(dict(id=i['id'], anyo=i['anyo'], mes=i['mes'], tipo=tipo, targets=list(T.keys()), mat=out))
    print(i['id'], tipo, list(T.keys()))
open(SITE + '/assets/afectiva.js', 'w').write('window.CEO_AFECT=' + json.dumps(res, separators=(',', ':')) + ';')
