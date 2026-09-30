'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const money = n => 'RD$ ' + (Number(n) || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 })
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fdate = s => s.split('-').reverse().join('/')
const shrink = file => new Promise(res => {
  const im = new Image()
  im.onload = () => {
    const k = Math.min(1, 600 / Math.max(im.width, im.height))
    const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k)
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); c.toBlob(res, 'image/jpeg', 0.75)
  }
  im.onerror = () => res(null); im.src = URL.createObjectURL(file)
})

const CODE = '1209'

function Login({ onOk }) {
  const [code, setCode] = useState(''); const [err, setErr] = useState('')
  function enter(e) {
    e.preventDefault()
    if (code.trim() === CODE) { try { localStorage.setItem('roxy_ok', '1') } catch {} onOk() }
    else setErr('Código incorrecto. Intenta de nuevo.')
  }
  return (
    <section className="login"><form className="card" onSubmit={enter}>
      <img className="logo" alt="Logo de Roxy Accesorios" src="/logo.webp" />
      <h1>Roxy Accesorios</h1>
      <p className="mute">Ingresa el código de acceso.</p>
      <label htmlFor="code">Código</label>
      <input id="code" type="password" inputMode="numeric" autoComplete="off" maxLength={12} value={code} onChange={e => setCode(e.target.value)} />
      <p className="err" role="alert">{err}</p>
      <button className="btn" style={{ marginTop: 8 }}>Entrar</button>
    </form></section>
  )
}

function App({ onExit }) {
  const [v, setV] = useState('panel'); const [items, setItems] = useState([]); const [mov, setMov] = useState([])
  const empty = { name: '', qty: '1', cost: '', gain: '', file: null }
  const [f, setF] = useState(empty); const [k, setK] = useState(0); const [open, setOpen] = useState(false)
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [n, setN] = useState({}); const [t, setT] = useState(null)
  const [rest, setRest] = useState(null); const [rq, setRq] = useState('1')

  const toast = (msg, bad) => { setT({ msg, bad }); clearTimeout(window.__t); window.__t = setTimeout(() => setT(null), 3500) }
  const load = useCallback(async () => {
    const a = await supabase.from('items').select('*').order('created_at', { ascending: false })
    const b = await supabase.from('movements').select('id,day,inv,sold,gain,item_name,qty,kind,created_at').order('created_at', { ascending: false })
    if (a.data) setItems(a.data); if (b.data) setMov(b.data)
  }, [])
  useEffect(() => {
    load()
    const ch = supabase.channel('cambios').on('postgres_changes', { event: '*', schema: 'public' }, load).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  async function add() {
    const name = f.name.trim(), qty = parseInt(f.qty, 10), cost = parseFloat(f.cost), gain = parseFloat(f.gain)
    if (!name) return setErr('Escribe el nombre del artículo.')
    if (!(qty > 0)) return setErr('La cantidad debe ser 1 o más.')
    if (!(cost >= 0)) return setErr('Escribe el precio de compra.')
    if (!(gain >= 0)) return setErr('Escribe la ganancia por unidad.')
    setBusy(true); setErr('')
    let image_url = null
    if (f.file) {
      const blob = await shrink(f.file)
      if (blob) {
        const path = `${crypto.randomUUID()}.jpg`
        const up = await supabase.storage.from('items').upload(path, blob, { contentType: 'image/jpeg' })
        if (up.error) { setBusy(false); return setErr('No se pudo subir la imagen. Intenta de nuevo.') }
        image_url = supabase.storage.from('items').getPublicUrl(path).data.publicUrl
      }
    }
    const r = await supabase.from('items').insert({ name, qty, cost, gain, image_url })
    if (r.error) { setBusy(false); return setErr('No se pudo guardar. Intenta de nuevo.') }
    await supabase.from('movements').insert({ day: today(), inv: cost * qty, sold: 0, gain: 0, item_name: name, qty, kind: 'compra' })
    setF(empty); setK(x => x + 1); setBusy(false); setOpen(false); toast(`Registrado: ${qty} × ${name}`); load()
  }
  async function sell(it) {
    const q = parseInt(n[it.id] ?? '1', 10)
    if (!(q > 0) || q > it.qty) return toast(`Cantidad inválida. Hay ${it.qty} en stock.`, true)
    const { error } = await supabase.rpc('sell_item', { p_id: it.id, p_n: q, p_day: today() })
    if (error) return toast(error.message, true)
    setN(s => ({ ...s, [it.id]: '1' })); toast(`Vendido: ${q} × ${it.name} · ${money((+it.cost + +it.gain) * q)}`); load()
  }
  async function restock() {
    const q = parseInt(rq, 10), it = rest
    if (!(q > 0)) return toast('La cantidad debe ser 1 o más.', true)
    const cur = await supabase.from('items').select('qty').eq('id', it.id).single()
    if (cur.error) return toast('No se pudo reponer. Intenta de nuevo.', true)
    const r = await supabase.from('items').update({ qty: cur.data.qty + q }).eq('id', it.id)
    if (r.error) return toast('No se pudo reponer. Intenta de nuevo.', true)
    await supabase.from('movements').insert({ day: today(), inv: it.cost * q, sold: 0, gain: 0, item_name: it.name, qty: q, kind: 'compra' })
    setRest(null); setRq('1'); toast(`Stock agregado: ${q} × ${it.name}`); load()
  }
  async function del(it) {
    if (!confirm(`¿Eliminar "${it.name}" del inventario? Las ventas ya registradas se conservan.`)) return
    await supabase.from('items').delete().eq('id', it.id); toast(`Eliminado: ${it.name}`); load()
  }

  let cost = 0, sale = 0, sold = 0, real = 0
  items.forEach(i => { cost += i.qty * i.cost; sale += i.qty * (+i.cost + +i.gain); sold += i.sold; real += i.sold * i.gain })
  const by = {}
  mov.forEach(m => { const o = by[m.day] || (by[m.day] = { inv: 0, sold: 0, gain: 0 }); o.inv += +m.inv; o.sold += +m.sold; o.gain += +m.gain })
  const days = Object.keys(by).sort().reverse()
  const set = (key, val) => setF(s => ({ ...s, [key]: val }))

  return (<>
    <main className="wrap">
      <div className="top">
        <div className="brand"><img className="logo" alt="" src="/logo.webp" /><h1>Roxy Accesorios</h1></div>
        <button className="link" onClick={onExit}>Salir</button>
      </div>

      {v === 'panel' && <section>
        <div className="card hero"><div className="mute">Inventario sin ganancia (inversión)</div><div className="big">{money(cost)}</div></div>
        <div className="grid2">
          <div className="card"><div className="mute">Inventario con ganancia</div><div className="big">{money(sale)}</div></div>
          <div className="card"><div className="mute">Ganancia esperada</div><div className="big gain">{money(sale - cost)}</div></div>
          <div className="card"><div className="mute">Artículos vendidos</div><div className="big">{sold}</div></div>
          <div className="card"><div className="mute">Ganancia realizada</div><div className="big gain">{money(real)}</div></div>
        </div>
        <div className="card">
          <div className="head"><h2>Inventario</h2><button className="btn sm" onClick={() => { setErr(''); setOpen(true) }}>+ Registrar artículo</button></div>
          {items.length === 0 && <div className="empty">Aún no hay artículos. Registra el primero.</div>}
          {items.map(i => (
            <div className="item" key={i.id}>
              {i.image_url ? <img className="thumb" alt="" src={i.image_url} /> : <div className="thumb" />}
              <div className="info"><b>{i.name}</b><br />
                <span className="mute">Stock {i.qty} · Vendidos {i.sold} · Venta <b>{money(+i.cost + +i.gain)}</b></span>
                <div className="sell">
                  <input type="number" inputMode="numeric" min="1" max={i.qty} value={n[i.id] ?? '1'} aria-label="Cantidad a vender" onChange={e => setN(s => ({ ...s, [i.id]: e.target.value }))} />
                  <button className="btn sm" disabled={!i.qty} onClick={() => sell(i)}>Vender</button>
                  <button className="btn sm ghost" onClick={() => { setRest(i); setRq('1') }}>Reponer</button>
                  <button className="btn sm ghost" onClick={() => del(i)}>Eliminar</button>
                </div>
              </div>
            </div>))}
        </div>
      </section>}

      {v === 'log' && <section>
        <div className="card"><div className="head"><h2>Resumen diario</h2></div>
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Fecha</th><th>Inversión</th><th>Total vendido</th><th>Ganancia</th></tr></thead>
            <tbody>
              {days.length === 0 && <tr><td colSpan="4" className="empty">Sin movimientos todavía.</td></tr>}
              {days.map(d => <tr key={d}><td>{fdate(d)}</td><td>{money(by[d].inv)}</td><td>{money(by[d].sold)}</td><td className="gain">{money(by[d].gain)}</td></tr>)}
            </tbody>
          </table></div></div>
        <div className="card"><div className="head"><h2>Movimientos</h2></div>
          {mov.length === 0 && <div className="empty">Aún no hay ventas ni ingresos.</div>}
          {mov.slice(0, 60).map(m => {
            const compra = (m.kind || (+m.inv > 0 ? 'compra' : 'venta')) === 'compra'
            return (<div className="mv" key={m.id}>
              <div><b>{compra ? 'Ingreso' : 'Venta'}</b>{m.item_name ? ` · ${m.qty || ''} × ${m.item_name}` : ''}<br /><span className="mute">{fdate(m.day)}</span></div>
              <div>{compra ? <span className="mute">− {money(m.inv)}</span> : <><b>{money(m.sold)}</b><br /><span className="gain">+ {money(m.gain)}</span></>}</div>
            </div>)
          })}
        </div>
      </section>}
    </main>

    {open && <div className="bg" onClick={() => setOpen(false)}><div className="sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Registrar artículo">
      <div className="head"><h2>Registrar artículo</h2><button className="link" onClick={() => setOpen(false)}>Cerrar</button></div>
      <label htmlFor="f-name">Artículo</label>
      <input id="f-name" type="text" maxLength={60} value={f.name} onChange={e => set('name', e.target.value)} />
      <div className="grid3">
        <div><label htmlFor="f-qty">Cantidad</label><input id="f-qty" type="number" inputMode="numeric" min="1" value={f.qty} onChange={e => set('qty', e.target.value)} /></div>
        <div><label htmlFor="f-cost">Compra (c/u)</label><input id="f-cost" type="number" inputMode="decimal" min="0" step="0.01" value={f.cost} onChange={e => set('cost', e.target.value)} /></div>
        <div><label htmlFor="f-gain">Ganancia (c/u)</label><input id="f-gain" type="number" inputMode="decimal" min="0" step="0.01" value={f.gain} onChange={e => set('gain', e.target.value)} /></div>
      </div>
      <label htmlFor="f-img">Imagen</label>
      <input key={k} id="f-img" type="file" accept="image/*" onChange={e => set('file', e.target.files[0] || null)} />
      <p className="err" role="alert">{err}</p>
      <button className="btn" disabled={busy} onClick={add}>{busy ? 'Guardando…' : 'Guardar artículo'}</button>
    </div></div>}

    {rest && <div className="bg" onClick={() => setRest(null)}><div className="sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Reponer stock">
      <div className="head"><h2>Reponer stock</h2><button className="link" onClick={() => setRest(null)}>Cerrar</button></div>
      <p className="mute" style={{ margin: 0 }}>{rest.name} · Stock actual {rest.qty} · Compra {money(rest.cost)} c/u</p>
      <label htmlFor="r-qty">Cantidad a agregar</label>
      <input id="r-qty" type="number" inputMode="numeric" min="1" value={rq} onChange={e => setRq(e.target.value)} />
      <button className="btn" onClick={restock}>Agregar stock</button>
    </div></div>}

    {t && <div className={'toast' + (t.bad ? ' bad' : '')} role="status">{t.msg}</div>}
    <nav className="nav">
      {[['panel', 'Panel'], ['log', 'Registro']].map(([id, x]) =>
        <button key={id} aria-current={v === id ? 'true' : undefined} onClick={() => { setV(id); window.scrollTo(0, 0) }}>{x}</button>)}
    </nav>
  </>)
}

export default function Home() {
  const [ok, setOk] = useState(undefined)
  useEffect(() => { try { setOk(localStorage.getItem('roxy_ok') === '1') } catch { setOk(false) } }, [])
  const exit = () => { try { localStorage.removeItem('roxy_ok') } catch {} setOk(false) }
  if (ok === undefined) return null
  return ok ? <App onExit={exit} /> : <Login onOk={() => setOk(true)} />
}
