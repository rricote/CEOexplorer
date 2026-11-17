"""Genera las páginas HTML (índice + una por encuesta) a partir de site/data/*.json"""
import json, glob, html, os
SITE = '/tmp/claude-0/w/site'
OLA = {'850': (2017, 1), '857': (2017, 2), '863': (2017, 3), '885': (2018, 1), '901': (2018, 2), '908': (2018, 3), '919': (2019, 1), '942': (2019, 2),
       '954': (2019, 3), '962': (2020, 1), '974': (2020, 2), '985': (2020, 3), '1019': (2022, 1), '1031': (2022, 2), '1035': (2022, 3), '1050': (2023, 1),
       '1061': (2023, 2), '1071': (2023, 3), '1082': (2024, 1), '1101': (2024, 2), '1112': (2024, 3), '1119': (2025, 1), '1126': (2025, 2), '1145': (2025, 3)}
MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&display=swap">'
E = html.escape
nf = lambda x: format(x, ',.0f').replace(',', '.')

METODO = """
<p>Cada encuesta se pondera con el mismo procedimiento (<b>raking</b> o ajuste iterativo de márgenes):</p>
<ol>
<li><b>Recuerdo de voto a la última elección al Parlament</b> anterior al trabajo de campo (2015, 2017, 2021 o 2024), usando la variable del CEO <i>sobre censo</i>, que incluye abstención.</li>
<li>Las categorías se agrupan en las candidaturas que se presentaron (p. ej. en 2015 ERC y CDC se suman a Junts pel Sí; Podemos, ICV o BComú a la marca de los comuns de cada momento), más <i>Otros, blanco y nulo</i>, <i>Abstención</i>, <i>NS/NC</i> y <i>No podía votar</i>.</li>
<li>Objetivo: el resultado oficial sobre el censo total. Las personas que no recuerdan o no contestan (NS/NC) y las que no podían votar conservan su peso observado; el resto de la muestra se reparte según el resultado real, abstención incluida.</li>
<li>A la vez se mantienen los márgenes de sexo, grupos de edad y provincia de la muestra (el CEO trabaja con cuotas proporcionales y su coeficiente PONDERA vale 1).</li>
<li>Los pesos se recortan al intervalo 0,2–5 para evitar que unos pocos casos dominen; se informa de la n efectiva (Kish) en cada encuesta.</li>
</ol>
<p class="note">Limitaciones: el censo usado incluye a los residentes en el extranjero (CERA), por lo que la abstención objetivo está algo sobreestimada para la población residente. Además, el recuerdo es una variable de opinión que se deforma con el tiempo (ocultación, ajuste a la preferencia actual); véase Alaminos y Alaminos-Fernández (2025), <i>REIS</i> 192, que desaconsejan usarlo como ajuste paramétrico general. Por eso cada página permite comparar con los datos <b>sin ponderar</b>.</p>
"""


def page(d):
    i = d['info']
    y, o = OLA.get(i['id'], (i['anyo'], 0))
    i['titulo'] = f"Baròmetre {o}a onada {y}" if o else f"Enquesta {i['id']}"
    i['campo'] = f"{MESES[i['mes']]} {i['anyo']}"
    data = json.dumps(d, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    keys = ''.join(f'<span class="chip">{E(k)}: <b class="mono">{E(v)}</b></span>' for k, v in i['claves'].items())
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>BOP {i['id']} · {E(i['titulo'])}</title>
<meta name="claude:viewport-fit-sides" content="cover">
{FONTS}
<link rel="stylesheet" href="../assets/explorer.css">
</head><body>
<div class="wrap">
  <header class="top">
    <a class="back" href="../index.html">← Todas las encuestas</a>
    <div class="eyebrow">Centre d'Estudis d'Opinió · BOP {i['id']}</div>
    <div class="row" style="justify-content:space-between;gap:12px"><h1>{E(i['titulo'])}</h1>
      <a class="btn-primary" href="informe_{i['id']}.html">← Volver al informe</a></div>
    <div class="chips">
      <span class="chip">Campo: <b>{E(i['campo'])}</b></span>
      <span class="chip">N = <b>{nf(i['n'])}</b></span>
      <span class="chip">Variables: <b>{i['nvars']}</b></span>
      <span class="chip">Recuerdo de referencia: <b>{E(i['eleccion'])}</b></span>
      <span class="chip {'warn' if i['kish'] < 0.6 * i['n'] else ''}">n efectiva ponderada: <b>{nf(i['kish'])}</b> ({100 * i['kish'] / i['n']:.0f}%)</span>
      <span class="chip">Pesos: <b>{i['wmin']:.2f}–{i['wmax']:.2f}</b></span>
    </div>
  </header>

  <div class="layout">
    <aside class="panel side" aria-label="Variables">
      <div class="row" style="justify-content:space-between"><h2>Variables</h2><span class="muted" id="vcount"></span></div>
      <input id="q" type="search" placeholder="Buscar por código o texto (p. ej. independ, VAL_, Illa)" aria-label="Buscar variable">
      <div class="typefilter" id="tf"></div>
      <p class="note" style="margin:0">F = filas · C = columnas · ▽ = filtro. Clic en el texto = filas.</p>
      <div class="vlist" id="vlist"></div>
    </aside>

    <main style="display:grid;gap:16px;min-width:0">
      <section class="panel" id="analysis" style="display:grid;gap:14px">
        <div class="row" style="justify-content:space-between">
          <div class="seg" id="wseg" role="group" aria-label="Ponderación">
            <button data-w="rec" aria-pressed="true">Recuerdo de voto</button>
            <button data-w="ceo">Ponderación CEO</button>
            <button data-w="none">Sin ponderar</button>
          </div>
          <div class="presets" id="presets"></div>
        </div>
        <div class="controls">
          <div class="ctl"><label for="selRow">Filas (variable a analizar)</label><select id="selRow"></select></div>
          <div class="ctl"><label for="selCol">Columnas (cruce)</label><select id="selCol"></select></div>
          <div class="ctl"><label for="selF">Filtro (submuestra)</label><select id="selF"></select></div>
          <div class="ctl"><label for="selChart">Gráfico</label><select id="selChart">
            <option value="auto">Automático</option><option value="bars">Barras horizontales</option><option value="stacked">Barras apiladas 100%</option>
            <option value="heat">Mapa de calor</option><option value="lines">Líneas</option><option value="means">Medias (escalas 0-10 / numéricas)</option></select></div>
          <div class="ctl"><label for="selBase">Porcentajes</label><select id="selBase"><option value="col">Por columna</option><option value="row">Por fila</option><option value="total">Sobre el total</option></select></div>
        </div>
        <div class="fcats" id="fcats" hidden></div>
        <div class="row">
          <label><input type="checkbox" id="chkNs"> Excluir NS/NC</label>
          <label><input type="checkbox" id="chkMoe"> Mostrar margen de error (±, 95%)</label>
          <button id="swap">Intercambiar filas y columnas</button>
          <button id="copy">Copiar tabla</button>
        </div>
        <div class="qtitle" id="qhead"></div>
        <div class="chart" id="chart"></div>
        <div class="legend" id="legend"></div>
        <div id="extra"></div>
        <div class="tablewrap" id="table"></div>
        <p class="note" id="basenote"></p>
      </section>

      <section class="panel" style="display:grid;gap:12px">
        <h2>Ponderación por recuerdo de voto</h2>
        <p class="note">Círculo vacío: distribución en la muestra. Círculo lleno: objetivo tras ponderar (resultado de {E(i['eleccion'])} sobre censo, con NS/NC y «no podía votar» fijos).</p>
        <div class="grid2"><div class="chart" id="diagchart"></div><div class="tablewrap" id="diagtable"></div></div>
        <details><summary>Cómo se calcula</summary>{METODO}</details>
      </section>

      <section class="panel">
        <details><summary>Catálogo completo de variables ({i['nvars']})</summary>
          <p class="note">Variables clave detectadas: </p><div class="chips">{keys}</div>
          <div class="tablewrap" id="catalog" style="margin-top:10px"></div></details>
      </section>
    </main>
  </div>
</div>
<script>window.CEO_DATA={data};</script>
<script src="../assets/explorer.js"></script>
</body></html>"""


def report_page(d):
    i = d['info']
    data = json.dumps(d, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Informe BOP {i['id']} · {E(i['titulo'])}</title>
<meta name="claude:viewport-fit-sides" content="cover">
{FONTS}
<link rel="stylesheet" href="../assets/explorer.css">
</head><body data-mode="informe">
<div class="wrap" style="max-width:1180px">
  <header class="top">
    <a class="back" href="../index.html">← Todas las encuestas</a>
    <div class="eyebrow">Informe detallado · BOP {i['id']} · campo {E(i['campo'])} · N = {nf(i['n'])}</div>
    <div class="row" style="justify-content:space-between;gap:12px"><h1>{E(i['titulo'])}</h1>
      <a class="btn-primary" href="bop_{i['id']}.html">Explorador de la encuesta →</a></div>
  </header>
  <div class="stickybar" role="toolbar" aria-label="Controles del informe">
    <span class="eyebrow">Controles</span>
    <div class="seg" id="wseg" role="group" aria-label="Ponderación">
      <button data-w="rec" aria-pressed="true">Recuerdo de voto</button>
      <button data-w="ceo">Ponderación CEO</button>
      <button data-w="none">Sin ponderar</button>
    </div>
    <div class="row" id="rep-aff-ctl"></div>
    <span class="note">Recuerdo {E(i['eleccion'])} · n efectiva {nf(i['kish'])}</span>
  </div>
  <main style="display:grid;gap:16px;min-width:0">
    <article class="panel" style="display:grid;gap:12px">
      <h2>1 · Autoubicación ideológica y voto</h2>
      <div class="row" id="rep-ideo-ctl"></div>
      <div id="rep-ideo" style="display:grid;gap:10px"></div>
    </article>
    <section class="panel" style="display:grid;gap:6px">
      <div><span class="eyebrow">Matriz de transferencias</span><h2>¿Adónde van y de dónde vienen los votos?</h2></div>
      <p class="note">Cruce entre el recuerdo de voto en las últimas elecciones al Parlament y la intención directa de voto actual.</p>
    </section>
    <article class="panel" style="display:grid;gap:12px"><h2>1.1 · Matriz de transferencias</h2><div class="row" id="rep-trm-ctl"></div><div id="rep-trm" style="display:grid;gap:10px"></div></article>
    <article class="panel" style="display:grid;gap:12px"><h2>1.2 · Transferencia de votos</h2><div class="row" id="rep-trb-ctl"></div><div id="rep-trb" style="display:grid;gap:10px"></div></article>
    <article class="panel" style="display:grid;gap:12px"><h2>1.3 · Sankey de transferencias</h2><div class="row" id="rep-trs-ctl"></div><div id="rep-trs" style="display:grid;gap:10px"></div></article>
    <article class="panel" style="display:grid;gap:12px"><h2>1.4 · Matriz de transferencias netas</h2><div class="row" id="rep-trn-ctl"></div><div id="rep-trn" style="display:grid;gap:10px"></div></article>
    <article class="panel" style="display:grid;gap:12px"><h2>1.5 · Transferencia de votos netas</h2><div class="row" id="rep-trnb-ctl"></div><div id="rep-trnb" style="display:grid;gap:10px"></div></article>
    <article class="panel" style="display:grid;gap:12px"><h2>1.6 · Sankey de transferencias netas</h2><div class="row" id="rep-trsn-ctl"></div><div id="rep-trsn" style="display:grid;gap:10px"></div></article>
    <section class="panel" style="display:grid;gap:6px">
      <div><span class="eyebrow">Polarización afectiva</span><h2>¿Se soportan los electorados entre sí?</h2></div>
      <p class="note">Basado en la pregunta «Quins sentiments de simpatia o antipatia li genera la gent que vota…» (0 = molta antipatia, 10 = molta simpatia). La barra de controles superior se mantiene fija mientras bajas.</p>
    </section>
    <article class="panel" style="display:grid;gap:12px"><h2>2 · Matriz de simpatía entre electorados</h2><div id="rep-aff" style="display:grid;gap:10px"></div></article>
    <article class="panel" style="display:grid;gap:12px"><h2>3 · Mapa de bloques y compatibilidad</h2><div id="rep-net" style="display:grid;gap:10px"></div></article>
    <section class="panel" style="display:grid;gap:6px">
      <div><span class="eyebrow">Líderes y solidez del voto</span><h2>Duros, blandos, posibles, difíciles e imposibles</h2></div>
      <p class="note">Basado en el capítulo 8 de <i>El arte de ganar</i> (Durán Barba y Nieto): la valoración de los líderes, la ambivalencia frente a rivales y la cercanía de cada elector al perfil del candidato.</p>
      <details><summary>Cómo se clasifica a cada elector</summary>
        <p class="note">Para cada candidato se calcula un <b>índice de cercanía</b> de 0 a 100 que combina: su valoración (45%), la diferencia con el líder rival mejor valorado (20%), la cercanía del elector al <i>elector ideal</i> del candidato (20%) y, cuando la encuesta lo pregunta, la simpatía hacia los votantes de su partido (15%). El elector ideal es el perfil medio (ideología, sentimiento de pertenencia, independencia, relación Cataluña-España, lengua y escalas de catalanismo y españolismo si existen) ponderado por (valoración − 5)², es decir, pesa más quien mejor valora al líder; cada atributo pesa según su correlación con esa valoración.</p>
        <ul class="note">
          <li><b>Base:</b> por defecto, los votantes potenciales (se excluye a quien declara que no votará). Los indecisos cuentan como votantes del partido por el que sienten más simpatía.</li>
          <li><b>Duros:</b> votarían al partido, valoran al líder con 7 o más, ningún rival les gusta más (el empate cuenta) y su índice es ≥ 50.</li>
          <li><b>Blandos:</b> votarían al partido pero no cumplen alguna de esas condiciones: un rival les gusta más, valoración tibia o no conocen al líder.</li>
          <li><b>Posibles:</b> no lo votan pero lo valoran con 6 o más (o con 5 y un índice ≥ 55), o no lo conocen y su perfil se parece al del elector ideal (≥ 0,6).</li>
          <li><b>Imposibles:</b> no lo votan y lo valoran con 2 o menos, o con 3-4 y un índice &lt; 35.</li>
          <li><b>Difíciles:</b> el resto de quienes no lo votan.</li>
        </ul>
        <p class="note">Es una propuesta de operacionalización: el libro no detalla el cálculo. Los umbrales se pueden ajustar.</p>
      </details>
    </section>
    <article class="panel" style="display:grid;gap:12px"><h2>5 · Valoración de líderes por electorado</h2><div id="rep-lead" style="display:grid;gap:10px"></div></article>
    <article class="panel" style="display:grid;gap:12px"><h2>6 · Ambivalencia entre líderes</h2><div class="row" id="rep-ambi-ctl"></div><div id="rep-ambi" style="display:grid;gap:10px"></div></article>
    <article class="panel" style="display:grid;gap:12px"><h2>7 · Mapa de votantes según su cercanía al candidato</h2><div class="row" id="rep-sol-ctl"></div><div id="rep-sol" style="display:grid;gap:10px"></div></article>
    <article class="panel" style="display:grid;gap:12px"><h2>8 · Solidez del voto y modelos integrados</h2><div id="rep-rings" style="display:grid;gap:12px"></div></article>
    <section class="panel" style="display:grid;gap:10px">
      <div><span class="eyebrow">Estrategia</span><h2>9 · Trabajar con los posibles</h2></div>
      <div class="note" style="max-width:85ch;display:grid;gap:8px">
        <p style="margin:0"><b>Quiénes son.</b> En <i>El arte de ganar</i>, los votantes posibles son quienes hoy no votan al candidato pero lo ven bien, o no lo conocen y no tienen nada en su contra. Suelen ser votantes blandos de otro partido o indecisos, y en algunas preguntas muestran actitudes que hacen pensar que podrían apoyarle. Junto con los blandos, son el grupo que más se mueve durante una campaña, en cualquier dirección.</p>
        <p style="margin:0"><b>Por qué importan.</b> Los duros ya han decidido y los difíciles e imposibles casi nunca cambian. El crecimiento de un candidato sale de sus posibles; su caída, de sus blandos. Por eso esta sección deja fuera a difíciles e imposibles y se centra en el territorio que el candidato puede disputar.</p>
        <p style="margin:0"><b>Cómo leerla.</b> (1) El mapa muestra a duros, blandos y posibles ordenados por cercanía al candidato. (2) Los consejos resumen lo que dicen los datos. (3) «De dónde vienen» indica a qué partido votan hoy los posibles y si ya valoran al candidato tanto como a su propio líder; de ahí sale a quién conviene atacar y a quién no. (4) El perfil comparado enseña en qué se parecen y en qué se diferencian posibles y duros. (5) «Qué acerca y qué aleja» recorre todas las preguntas de la encuesta en busca de las actitudes, temas y valoraciones que distinguen a los posibles más cercanos de los más lejanos.</p>
        <p style="margin:0"><b>Cautelas.</b> Las palancas son asociaciones, no causas: que los posibles cercanos valoren mejor al Govern no garantiza que hablar de gestión los atraiga. Con grupos de menos de 50 entrevistas las diferencias son poco fiables. Lo prudente es buscar resultados que se repitan en varias olas.</p>
      </div>
      <div class="row" id="rep-pos-ctl"></div>
      <div id="rep-pos" style="display:grid;gap:12px"></div>
    </section>
  </main>
</div>
<script>window.CEO_DATA={data};</script>
<script src="../assets/afectiva.js"></script>
<script src="../assets/explorer.js"></script>
</body></html>"""


def index(items, standalone):
    by = {}
    for it in items: by.setdefault(it['anyo_ola'], []).append(it)
    cards = ''
    for y in sorted(by, reverse=True):
        rows = ''
        for it in sorted(by[y], key=lambda x: -int(x['id'])):
            k = it['claves']
            rows += f"""<a class="card" href="encuestas/informe_{it['id']}.html">
  <span class="num mono">{it['id']}</span>
  <span class="t"><b>{E(it['titulo'])}</b><span class="muted">Campo {E(it['campo'])} · N {nf(it['n'])} · {it['nvars']} variables</span></span>
  <span class="ref"><span class="eyebrow">Recuerdo</span>{E(it['eleccion'])}</span>
  <span class="ref"><span class="eyebrow">n efectiva</span>{nf(it['kish'])} <span class="muted">({100 * it['kish'] / it['n']:.0f}%)</span></span>
</a>"""
        cards += f'<section class="yr"><h2>{y}</h2><div class="cards">{rows}</div></section>'
    head = f"""<title>Baròmetres CEO</title>
<meta name="claude:viewport-fit-sides" content="cover">
{FONTS}
<style>
/* Layout: listado cronológico por año, una fila por barómetro */
:root {{ --bg:#f3f5f7; --panel:#fff; --ink:#16202b; --muted:#5b6876; --line:#d9dfe5; --soft:#e9edf1; --accent:#23408e;
  --f-display:"Source Serif 4",Georgia,serif; --f-body:"IBM Plex Sans",system-ui,sans-serif; --f-mono:"IBM Plex Mono",ui-monospace,monospace; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#11161c; --panel:#182029; --ink:#e6ebf0; --muted:#9aa7b4; --line:#2b3642; --soft:#212b36; --accent:#8fa9f0; color-scheme:dark; }} }}
:root[data-theme="dark"] {{ --bg:#11161c; --panel:#182029; --ink:#e6ebf0; --muted:#9aa7b4; --line:#2b3642; --soft:#212b36; --accent:#8fa9f0; color-scheme:dark; }}
body {{ background:var(--bg); color:var(--ink); font-family:var(--f-body); font-size:14px; line-height:1.5; margin:0;
  padding-left:max(16px,env(safe-area-inset-left,0px)); padding-right:max(16px,env(safe-area-inset-right,0px)); padding-block:28px 48px; }}
.wrap {{ max-width:980px; margin:0 auto; display:grid; gap:28px; }}
h1,h2 {{ font-family:var(--f-display); font-weight:600; margin:0; text-wrap:balance; }}
h1 {{ font-size:2.1rem; line-height:1.1; }} h2 {{ font-size:1.2rem; }}
.mono {{ font-family:var(--f-mono); }} .muted {{ color:var(--muted); }}
.eyebrow {{ display:block; font-size:.68rem; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); font-weight:600; }}
.lead {{ max-width:68ch; color:var(--muted); margin:6px 0 0; }}
.yr {{ display:grid; grid-template-columns:80px minmax(0,1fr); gap:16px; align-items:start; }}
@media (max-width:620px) {{ .yr {{ grid-template-columns:minmax(0,1fr); gap:8px; }} }}
.cards {{ display:grid; gap:6px; }}
.card {{ display:grid; grid-template-columns:56px minmax(0,1fr) 130px 110px; gap:12px; align-items:center; text-decoration:none; color:inherit;
  background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:10px 14px; font-variant-numeric:tabular-nums; }}
.card:hover {{ border-color:var(--accent); }} .card:focus-visible {{ outline:2px solid var(--accent); }}
.card .num {{ font-size:1.05rem; color:var(--accent); font-weight:500; }}
.card .t {{ display:grid; min-width:0; }} .card .t .muted {{ font-size:.82rem; }}
.card .ref {{ font-size:.85rem; }}
@media (max-width:620px) {{ .card {{ grid-template-columns:48px minmax(0,1fr); }} .card .ref {{ grid-column:2; }} }}
.method {{ background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px 18px; }}
.method p, .method li {{ max-width:75ch; }} .note {{ font-size:.85rem; color:var(--muted); }}
</style>"""
    body = f"""<div class="wrap">
<header><span class="eyebrow">Centre d'Estudis d'Opinió · Baròmetres d'Opinió Política</span><h1>Baròmetres CEO</h1>
<p class="lead">{len(items)} barómetros entre 2017 y 2025. Cada uno abre su informe detallado y, desde él, el explorador con todas sus variables, cruces y gráficos, con la ponderación por recuerdo de voto aplicada con el mismo criterio.</p></header>
{cards}
</div>"""
    if standalone:
        return f'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">{head}</head><body>{body}</body></html>'
    return head + body


if __name__ == '__main__':
    os.makedirs(SITE + '/encuestas', exist_ok=True)
    items = []
    for f in sorted(glob.glob(SITE + '/data/[0-9]*.json'), key=lambda f: int(os.path.basename(f)[:-5])):
        d = json.load(open(f))
        open(f"{SITE}/encuestas/bop_{d['info']['id']}.html", 'w').write(page(d))
        open(f"{SITE}/encuestas/informe_{d['info']['id']}.html", 'w').write(report_page(d))
        i = d['info']; y, o = OLA.get(i['id'], (i['anyo'], 0))
        items.append(dict(id=i['id'], titulo=i['titulo'], campo=i['campo'], n=i['n'], nvars=i['nvars'], eleccion=i['eleccion'], kish=i['kish'], claves=i['claves'], anyo_ola=y))
    open(SITE + '/index.html', 'w').write(index(items, False))
    open(SITE + '/index_local.html', 'w').write(index(items, True))
    print(len(items), 'páginas')
