import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faRotateLeft, faLock, faMoneyBillTransfer, faHeart, faPills } from '@fortawesome/free-solid-svg-icons';
import { ModulePage } from '../../Global/ModulePage';
import GlobalDivTable from '../../Global/GlobalDivTable';
import CrudModal from '../../Global/Modales/CrudModal';
import ModuleFeedback from '../../Global/ModuleFeedback';
import { canWrite } from '../../_shared/auth/session';
import { medicamentosApi as api } from '../api/medicamentosApi';
import { useMedicamentos } from '../hooks/useMedicamentos';
import { Campos, Campo, op } from '../modales/CamposMedicamentos';
import BuscadorEntidad from '../modales/BuscadorEntidad';
import { fecha, fechaHoy, dinero, num } from '../utils/medicamentosUtils';
import { operacionConClave } from '../utils/medicamentosOperacion';
import '../Medicamentos.css';

const buscarSocios = async buscar => {
  const response = await api.socios(buscar);
  return (response.registros || []).map(p => ({
    clave: `SOCIO:${p.id_socio}`, nombre: p.denominacion,
    tipo: 'SOCIO', detalle: p.documento || 'SIN DOCUMENTO', id_socio: p.id_socio,
  }));
};
const newLoan = () => ({ id_socio: '', fecha_devolucion_prevista: '', sena: '0', id_medio_pago: '', observaciones: '', items: [{ id_lote: '', cantidad: '1' }] });
const newReturn = (idDetalle = '') => ({ id_detalle_prestamo: idDetalle, cantidad: '1', numero_lote: '', fecha_vencimiento: '', observaciones: '' });
const newMoney = () => ({ monto: '', id_medio_pago: '', observaciones: '' });
const tituloAccion = (icon, text) => <span className="med-modal-icon-title"><FontAwesomeIcon icon={icon} aria-hidden="true" />{text}</span>;

function IconAction({ icon, label, onClick, danger = false, disabled = false }) {
  return <button type="button" className={`med-mini med-icon-action${danger ? ' med-mini--danger' : ''}`}
    aria-label={label} title={label} onClick={onClick} disabled={disabled}>
    <FontAwesomeIcon icon={icon} aria-hidden="true" />
  </button>;
}
const saldoSena = items => Math.max(0, Math.round((items || []).reduce((n, item) => n + (item.tipo === 'COBRO_SENA' ? num(item.monto) : -num(item.monto)), 0) * 100) / 100);
const saldoFila = p => Math.max(0, Math.round((num(p.sena_cobrada) - num(p.sena_devuelta) - num(p.sena_donada)) * 100) / 100);
const faltanDevolver = items => (items || []).reduce((n, item) => n + Math.max(0, num(item.cantidad_entregada) - num(item.cantidad_recibida)), 0);

export default function Prestamos() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('TODOS');
  const [queryAplicada, setQueryAplicada] = useState('');
  useEffect(() => {
    const timeout = window.setTimeout(() => { setPage(1); setQueryAplicada(query); }, 350);
    return () => window.clearTimeout(timeout);
  }, [query]);
  const [page, setPage] = useState(1);
  const loader = useCallback(() => api.prestamos({ buscar: queryAplicada, estado: status, pagina: page }), [queryAplicada, status, page]);
  const { registros, loading, error, cargar, total, pagina } = useMedicamentos(loader);
  const [medios, setMedios] = useState([]);
  const [lots, setLots] = useState([]);
  const [modal, setModal] = useState('');
  const [form, setForm] = useState(newLoan);
  const [returnForm, setReturnForm] = useState(newReturn);
  const [moneyForm, setMoneyForm] = useState(newMoney);
  const [chosenPerson, setChosenPerson] = useState(null);
  const [detail, setDetail] = useState(null);
  const [fetchingId, setFetchingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const guardandoRef = useRef(false);
  const pendienteOperacion = useRef(null);
  const consultaEnCurso = useRef(false);
  const solicitudLotes = useRef(0);
  const [cargandoLotes, setCargandoLotes] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const write = canWrite();
  const notify = (type, message) => setFeedback({ type, message });

  useEffect(() => {
    let active = true;
    api.medios().then(m => { if (active) setMedios(m.registros || []); })
      .catch(e => { if (active) setFeedback({ type: 'error', message: e.message }); });
    return () => { active = false; };
  }, []);

  const openLoan = async () => {
    const token = ++solicitudLotes.current;
    setForm(newLoan()); setChosenPerson(null); setLots([]); setModal('prestamo');
    setCargandoLotes(true);
    pendienteOperacion.current = null;
    try {
      const response = await api.lotes({ disponibles: 1 });
      if (token === solicitudLotes.current) setLots(response.registros || []);
    } catch (e) {
      if (token === solicitudLotes.current) notify('error', e.message || 'No se pudieron consultar los lotes disponibles.');
    } finally {
      if (token === solicitudLotes.current) setCargandoLotes(false);
    }
  };
  const cerrarPrestamoNuevo = () => {
    if (guardandoRef.current) return;
    ++solicitudLotes.current;
    setCargandoLotes(false);
    setModal('');
  };

  // Cada acción está directamente en la tabla y abre un solo modal.
  // Reconsultamos el préstamo antes de abrir para no usar saldos o cantidades antiguos.
  const openAction = async (id, action) => {
    if (consultaEnCurso.current || guardandoRef.current) return;
    consultaEnCurso.current = true;
    setFetchingId(id);
    try {
      const data = await api.prestamoDetalle(id);
      const isOpen = data.prestamo.estado === 'ABIERTO';
      const remaining = (data.detalle || []).filter(d => num(d.cantidad_entregada) > num(d.cantidad_recibida));
      const balance = saldoSena(data.senas);
      if (action !== 'detalle' && !isOpen) throw new Error('Este préstamo ya está cerrado.');
      if (action === 'devolucion' && remaining.length === 0) throw new Error('Este préstamo no tiene medicamentos pendientes de devolución.');
      if ((action === 'reintegrar' || action === 'donar') && balance < 0.01) throw new Error('No queda seña pendiente de resolver.');
      pendienteOperacion.current = null;
      setDetail(data);
      if (action === 'devolucion') setReturnForm(newReturn(remaining[0].id_detalle_prestamo));
      if (action === 'reintegrar' || action === 'donar') setMoneyForm({ ...newMoney(), monto: balance.toFixed(2) });
      setModal(action);
    } catch (e) { notify('error', e.message || 'No se pudo abrir la operación.'); }
    finally { consultaEnCurso.current = false; setFetchingId(null); }
  };

  const run = async (event, method, payload) => {
    event.preventDefault();
    if (guardandoRef.current) return;
    guardandoRef.current = true;
    setSaving(true);
    try {
      const resultado = await method(operacionConClave(pendienteOperacion, payload));
      pendienteOperacion.current = null;
      // Cerrar primero: una falla en la recarga no debe ofrecer repetir una escritura exitosa.
      setModal(''); setDetail(null);
      if (method === api.devolver && resultado?.estado_lote === 'BLOQUEADO') {
        notify('success', 'Devolución registrada. El lote recibido quedó BLOQUEADO porque el lote de origen no está habilitado; revisalo en Stock > Lotes y vencimientos antes de utilizarlo.');
      } else {
        notify('success', 'Operación registrada correctamente.');
      }
      await cargar({ silencioso: true });
    } catch (e) { notify('error', e.message || 'No se pudo registrar la operación.'); }
    finally { guardandoRef.current = false; setSaving(false); }
  };

  const available = lots.filter(l => num(l.medicamento_activo) === 1 && l.estado === 'ACTIVO' && l.fecha_vencimiento >= fechaHoy() && num(l.cantidad_disponible) > 0);
  const opts = [op('', 'Seleccionar lote'), ...available.map(l => op(l.id_lote, `${l.nombre_comercial} · ${l.dosis} · Lote ${l.numero_lote || l.id_lote} · ${l.cantidad_disponible} disponibles`))];
  const paymentOpts = [op('', 'Seleccionar medio'), ...medios.map(m => op(m.id_medio_pago, m.nombre))];
  const shown = registros;
  const pages = Math.max(1, Math.ceil(total / 20));
  const details = detail?.detalle || [];
  const balance = saldoSena(detail?.senas);
  const remaining = faltanDevolver(details);
  const returnable = details.filter(d => num(d.cantidad_entregada) > num(d.cantidad_recibida));
  const chosenReturn = details.find(d => String(d.id_detalle_prestamo) === String(returnForm.id_detalle_prestamo));
  const returnMax = chosenReturn ? Math.max(0, num(chosenReturn.cantidad_entregada) - num(chosenReturn.cantidad_recibida)) : 0;
  const loanId = detail?.prestamo?.id_prestamo;

  return <>
    <ModulePage title="Medicamentos · Préstamos"
      filters={[{ type: 'search', label: 'Buscar socio', value: query, onChange: setQuery, placeholder: 'Nombre, DNI o préstamo...' },
        { type: 'select', label: 'Estado', value: status, onChange: v => { setStatus(v); setPage(1); }, options: [op('TODOS', 'TODOS'), op('ABIERTO', 'ABIERTOS'), op('CERRADO', 'CERRADOS')] }]}
      primaryActionLabel="Nuevo préstamo" onPrimaryAction={openLoan} canCreate={write}>
      {error ? <div className="med-inline-danger">{error}</div> : null}
      <GlobalDivTable ariaLabel="Préstamos de medicamentos" className="med-table" gridClassName="med-grid--loans" loading={loading} columns={['N.º', 'Socio / documento', 'Fecha', 'Estado', 'Seña pendiente', 'Acciones']}>
        {shown.map(p => <div className="mov-gridTable mov-gridTable--row global-divTable__row" key={p.id_prestamo} role="row">
          <div className="mov-gridCell" role="cell">#{p.id_prestamo}</div>
          <div className="mov-gridCell" role="cell">{p.socio || '—'} · {p.documento || '—'}</div>
          <div className="mov-gridCell" role="cell">{fecha(p.fecha_entrega)}</div>
          <div className="mov-gridCell" role="cell">{p.estado}</div>
          <div className="mov-gridCell" role="cell">{dinero(saldoFila(p))}</div>
          <div className="mov-gridCell med-actions" role="cell">
            <IconAction icon={faEye} label={`Ver detalle del préstamo #${p.id_prestamo}`} onClick={() => openAction(p.id_prestamo, 'detalle')} disabled={fetchingId !== null || saving} />
            {write && p.estado === 'ABIERTO' ? <>
              <IconAction icon={faRotateLeft} label="Registrar devolución de medicamentos" onClick={() => openAction(p.id_prestamo, 'devolucion')} disabled={fetchingId !== null || saving} />
              {saldoFila(p) >= 0.01 ? <>
                <IconAction icon={faMoneyBillTransfer} label="Reintegrar seña" onClick={() => openAction(p.id_prestamo, 'reintegrar')} disabled={fetchingId !== null || saving} />
                <IconAction icon={faHeart} label="Donar seña a LALCEC" onClick={() => openAction(p.id_prestamo, 'donar')} disabled={fetchingId !== null || saving} />
              </> : null}
              <IconAction icon={faLock} label="Cerrar préstamo" danger onClick={() => openAction(p.id_prestamo, 'cierre')} disabled={fetchingId !== null || saving} />
            </> : null}
          </div>
        </div>)}
        {!loading && !registros.length ? <p className="med-empty">No hay préstamos que coincidan.</p> : null}
      </GlobalDivTable>
      <div className="med-bottom"><span>{total} préstamos · Página {pagina} de {pages}</span>
        <div><button type="button" disabled={pagina <= 1} onClick={() => setPage(pagina - 1)}>Anterior</button>{' '}
          <button type="button" disabled={pagina >= pages} onClick={() => setPage(pagina + 1)}>Siguiente</button></div></div>
    </ModulePage>

    <CrudModal open={modal === 'prestamo'} wide saving={saving} loading={cargandoLotes} title={tituloAccion(faPills, 'Registrar préstamo de medicamentos')}
      onClose={cerrarPrestamoNuevo} submitDisabled={cargandoLotes || available.length === 0}
      onSubmit={e => run(e, api.prestar, form)}>
      <Campos>
        <BuscadorEntidad label="Socio que retira" required wide placeholder="Escribí nombre, apellido o DNI y seleccioná un socio..."
          value={form.id_socio} selectedLabel={chosenPerson?.nombre || ''} buscar={buscarSocios} onSelect={item => {
            setChosenPerson(item); setForm(f => ({ ...f, id_socio: item?.id_socio || '' }));
          }} />
        <Campo label="Fecha prevista de devolución (opcional)" type="date" min={fechaHoy()} value={form.fecha_devolucion_prevista} onChange={v => setForm(f => ({ ...f, fecha_devolucion_prevista: v }))} />
        <Campo label="Seña cobrada ($)" type="number" min="0" step="0.01" value={form.sena} onChange={v => setForm(f => ({ ...f, sena: v }))} />
        {num(form.sena) > 0 ? <Campo label="Medio de pago de seña" required value={form.id_medio_pago} options={paymentOpts} onChange={v => setForm(f => ({ ...f, id_medio_pago: v }))} /> : null}
        <div className="entity-field entity-field--wide"><span>Medicamentos y lotes entregados</span>
          {form.items.map((item, i) => <div className="med-box" key={i}>
            <div className="entity-form__grid"><Campo label={`Lote ${i + 1}`} required value={item.id_lote} options={opts} onChange={v => setForm(f => ({ ...f, items: f.items.map((r, k) => k === i ? { ...r, id_lote: v } : r) }))} />
              <Campo label="Cantidad" required type="number" min="1" step="1" value={item.cantidad} onChange={v => setForm(f => ({ ...f, items: f.items.map((r, k) => k === i ? { ...r, cantidad: v } : r) }))} /></div>
            {form.items.length > 1 ? <button className="med-mini med-mini--danger" type="button" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, k) => k !== i) }))}>Quitar lote</button> : null}
          </div>)}
          <button type="button" className="med-mini" disabled={form.items.length >= 30} onClick={() => setForm(f => ({ ...f, items: [...f.items, { id_lote: '', cantidad: '1' }] }))}>+ Agregar otro lote</button>
        </div>
        <Campo label="Observaciones" wide textarea value={form.observaciones} onChange={v => setForm(f => ({ ...f, observaciones: v }))} />
      </Campos>
      <p className="med-inline-note">El préstamo descuenta los medicamentos del stock y cobra la seña una sola vez.</p>
    </CrudModal>

    {/* Consulta solamente: ninguna otra acción se esconde dentro de este modal. */}
    <CrudModal open={modal === 'detalle'} wide hideSubmit title={tituloAccion(faEye, `Préstamo #${loanId || ''}`)}
      subtitle={detail?.prestamo?.socio || ''} onClose={() => setModal('')}>
      {detail ? <>
        <div className="med-loan-summary">
          <div><span>Estado</span><strong>{detail.prestamo.estado}</strong></div>
          <div><span>Fecha de entrega</span><strong>{fecha(detail.prestamo.fecha_entrega)}</strong></div>
          <div><span>Seña pendiente</span><strong>{dinero(balance)}</strong></div>
        </div>
        <section className="med-box"><h3>Medicamentos entregados</h3>
          {details.map(d => <div className="med-detail-row" key={d.id_detalle_prestamo}>
            <div><strong>{d.nombre_comercial} · {d.dosis}</strong>
              <div className="med-loan-muted">Entregado: {d.cantidad_entregada} · Devuelto: {d.cantidad_recibida} · Pendiente: {Math.max(0, num(d.cantidad_entregada) - num(d.cantidad_recibida))}</div>
            </div>
          </div>)}
        </section>
        {detail.devoluciones.length > 0 ? <section className="med-box"><h3>Devoluciones registradas</h3>
          {detail.devoluciones.map(r => <div className="med-detail-row" key={r.id_devolucion}>
            <div><strong>{r.cantidad} unidad(es) · {fecha(r.fecha_recepcion)}</strong>
              <div className="med-loan-muted">Lote {r.numero_lote || r.id_lote_recibido || '—'}{r.estado === 'PENDIENTE_REVISION' ? ' · Registro anterior pendiente de incorporar' : r.estado === 'RECHAZADA' ? ' · No incorporado al stock' : r.estado_lote_recibido === 'BLOQUEADO' ? ' · Lote bloqueado (sin habilitar para uso)' : r.estado_lote_recibido === 'DESCARTADO' ? ' · Lote descartado' : ''}</div>
            </div>
          </div>)}
        </section> : null}
        <section className="med-box"><h3>Movimientos de seña</h3>
          {detail.senas.length ? detail.senas.map(m => <div className="med-detail-row" key={m.id_movimiento_sena}>
            <span>{m.tipo === 'COBRO_SENA' ? 'Cobro' : m.tipo === 'DEVOLUCION_SENA' ? 'Reintegro' : 'Donación'} · {fecha(m.fecha_movimiento)} {m.medio_pago ? `· ${m.medio_pago}` : ''}</span><strong>{dinero(m.monto)}</strong>
          </div>) : <p className="med-loan-muted">Sin movimientos de seña.</p>}
        </section>
      </> : null}
    </CrudModal>

    <CrudModal open={modal === 'devolucion'} saving={saving} title={tituloAccion(faRotateLeft, 'Registrar devolución de medicamentos')}
      onClose={() => setModal('')} submitLabel="Registrar devolución"
      submitDisabled={!chosenReturn || returnMax < 1 || !Number.isInteger(Number(returnForm.cantidad)) || num(returnForm.cantidad) < 1 || num(returnForm.cantidad) > returnMax}
      onSubmit={e => run(e, api.devolver, returnForm)}>
      <p className="med-loan-muted">Registrá lo que devuelve el socio. El stock se actualiza al guardar, sin pasos de aprobación. Si el lote de origen está bloqueado, descartado o vencido, el recibido quedará bloqueado hasta su revisión.</p>
      <Campos>
        <Campo label="Medicamento devuelto" required value={returnForm.id_detalle_prestamo}
          options={returnable.map(d => op(d.id_detalle_prestamo, `${d.nombre_comercial} · ${d.dosis} · ${Math.max(0, num(d.cantidad_entregada) - num(d.cantidad_recibida))} pendientes`))}
          onChange={v => setReturnForm(f => ({ ...f, id_detalle_prestamo: v, cantidad: '1' }))} />
        <Campo label={`Cantidad recibida (máximo ${returnMax})`} type="number" min="1" step="1" required
          value={returnForm.cantidad} onChange={v => setReturnForm(f => ({ ...f, cantidad: v }))} />
        <Campo label="Vencimiento del medicamento recibido" type="date" min={fechaHoy()} required value={returnForm.fecha_vencimiento}
          onChange={v => setReturnForm(f => ({ ...f, fecha_vencimiento: v }))} />
        <Campo label="Número de lote (opcional)" value={returnForm.numero_lote}
          onChange={v => setReturnForm(f => ({ ...f, numero_lote: v }))} />
        <Campo label="Observaciones" wide textarea value={returnForm.observaciones}
          onChange={v => setReturnForm(f => ({ ...f, observaciones: v }))} />
      </Campos>
      <p className="med-inline-note">La devolución de medicamentos no devuelve dinero automáticamente. La seña tiene sus propias acciones.</p>
    </CrudModal>

    <CrudModal open={modal === 'reintegrar'} saving={saving} title={tituloAccion(faMoneyBillTransfer, 'Reintegrar seña')}
      onClose={() => setModal('')} submitLabel="Confirmar reintegro"
      onSubmit={e => run(e, api.sena, { ...moneyForm, tipo: 'DEVOLUCION_SENA', id_prestamo: loanId })}>
      <p className="med-loan-muted">Seña disponible para reintegrar: <strong>{dinero(balance)}</strong></p>
      <Campos>
        <Campo label="Monto a reintegrar ($)" type="number" min="0.01" step="0.01" required value={moneyForm.monto}
          onChange={v => setMoneyForm(f => ({ ...f, monto: v }))} />
        <Campo label="Medio de pago del reintegro" required value={moneyForm.id_medio_pago}
          options={paymentOpts} onChange={v => setMoneyForm(f => ({ ...f, id_medio_pago: v }))} />
        <Campo label="Observaciones" wide textarea value={moneyForm.observaciones}
          onChange={v => setMoneyForm(f => ({ ...f, observaciones: v }))} />
      </Campos>
      <p className="med-inline-note">Se registrará un egreso por el dinero que LALCEC devuelve al socio.</p>
    </CrudModal>

    <CrudModal open={modal === 'donar'} saving={saving} title={tituloAccion(faHeart, 'Registrar donación de seña')}
      onClose={() => setModal('')} submitLabel="Confirmar donación"
      onSubmit={e => run(e, api.sena, { ...moneyForm, tipo: 'SENA_DONADA', id_prestamo: loanId })}>
      <p className="med-loan-muted">Seña disponible para donar: <strong>{dinero(balance)}</strong></p>
      <Campos>
        <Campo label="Monto que queda como donación ($)" type="number" min="0.01" step="0.01" required value={moneyForm.monto}
          onChange={v => setMoneyForm(f => ({ ...f, monto: v }))} />
        <Campo label="Observaciones" wide textarea value={moneyForm.observaciones}
          onChange={v => setMoneyForm(f => ({ ...f, observaciones: v }))} />
      </Campos>
      <p className="med-inline-note">LALCEC conserva ese dinero. No se registrará un segundo ingreso a caja.</p>
    </CrudModal>

    <CrudModal open={modal === 'cierre'} saving={saving} danger title={tituloAccion(faLock, 'Cerrar préstamo definitivamente')}
      submitLabel="Confirmar cierre" onClose={() => setModal('')}
      onSubmit={e => run(e, api.cerrar, { id_prestamo: loanId })}>
      <div className="med-loan-close-summary">
        <div><span>Unidades que no se devolvieron</span><strong>{remaining}</strong></div>
        <div><span>Seña que quedará como donación</span><strong>{dinero(balance)}</strong></div>
      </div>
      <p className="med-inline-note">Las unidades ya salieron del stock cuando se creó el préstamo. Al cerrar no se descuentan otra vez.</p>
      <p className="med-inline-note">Si queda seña pendiente, LALCEC la conserva como donación, sin cobrarla nuevamente. El préstamo quedará cerrado definitivamente.</p>
    </CrudModal>

    {feedback ? <ModuleFeedback {...feedback} onClose={() => setFeedback(null)} /> : null}
  </>;
}
