import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleInfo, faRotateLeft, faLock, faMoneyBillTransfer, faPills, faInbox } from '@fortawesome/free-solid-svg-icons';
import { ModulePage } from '../../Global/ModulePage';
import GlobalDivTable from '../../Global/GlobalDivTable';
import GlobalPagination from '../../Global/GlobalPagination';
import CrudModal from '../../Global/Modales/CrudModal';
import ModalEliminarGlobal from '../../Global/Modales/ModalEliminarGlobal';
import ModuleFeedback from '../../Global/ModuleFeedback';
import { canWrite } from '../../_shared/auth/session';
import { medicamentosApi as api } from '../api/medicamentosApi';
import { useMedicamentos } from '../hooks/useMedicamentos';
import { Campos, Campo, op } from '../modales/CamposMedicamentos';
import BuscadorEntidad from '../modales/BuscadorEntidad';
import { fecha, fechaHoy, dinero, num } from '../utils/medicamentosUtils';
import MedicamentosTabs, { MedSection } from '../modales/MedicamentosTabs';
import AlertasVencimientos from '../alertas/AlertasVencimientos';
import '../Medicamentos.css';

const buscarSocios = async buscar => {
  const response = await api.socios(buscar);
  return (response.registros || []).map(p => ({
    clave: `SOCIO:${p.id_socio}`, nombre: p.denominacion,
    tipo: 'SOCIO', detalle: p.documento || 'SIN DOCUMENTO', id_socio: p.id_socio,
  }));
};
const newLoan = () => ({ id_socio: '', fecha_devolucion_prevista: '', sena: '0', id_medio_pago: '', observaciones: '', items: [{ id_medicamento: '', cantidad: '1' }] });
const newReturn = (idDetalle = '') => ({ id_detalle_prestamo: idDetalle, cantidad: '1', observaciones: '' });
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
// Los movimientos válidos de devolución se suman en el backend al listar préstamos.
const progresoMedicamentos = p => {
  const entregadas = Math.max(0, num(p.unidades_entregadas));
  const devueltas = Math.min(entregadas, Math.max(0, num(p.unidades_devueltas)));
  return { entregadas, devueltas, sinDevolver: entregadas - devueltas };
};
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
  const { registros, loading, error, cargar, total, pagina, por_pagina } = useMedicamentos(loader);
  const [medios, setMedios] = useState([]);
  const [medicamentos, setMedicamentos] = useState([]);
  const [modal, setModal] = useState('');
  const [form, setForm] = useState(newLoan);
  const [returnForm, setReturnForm] = useState(newReturn);
  const [moneyForm, setMoneyForm] = useState(newMoney);
  const [chosenPerson, setChosenPerson] = useState(null);
  const [detail, setDetail] = useState(null);
  const [fetchingId, setFetchingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const guardandoRef = useRef(false);
  const consultaEnCurso = useRef(false);
  const solicitudMedicamentos = useRef(0);
  const [cargandoMedicamentos, setCargandoLotes] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [alertRevision, setAlertRevision] = useState(0);
  const write = canWrite();
  const notify = (type, message) => setFeedback({ type, message });

  useEffect(() => {
    let active = true;
    api.medios().then(m => { if (active) setMedios(m.registros || []); })
      .catch(e => { if (active) setFeedback({ type: 'error', message: e.message }); });
    return () => { active = false; };
  }, []);

  const openLoan = async () => {
    const token = ++solicitudMedicamentos.current;
    setForm(newLoan()); setChosenPerson(null); setMedicamentos([]); setModal('prestamo');
    setCargandoLotes(true);
    try {
      const response = await api.catalogo();
      if (token === solicitudMedicamentos.current) setMedicamentos(response.registros || []);
    } catch (e) {
      if (token === solicitudMedicamentos.current) notify('error', e.message || 'No se pudieron consultar los medicamentos disponibles.');
    } finally {
      if (token === solicitudMedicamentos.current) setCargandoLotes(false);
    }
  };
  const cerrarPrestamoNuevo = () => {
    if (guardandoRef.current) return;
    ++solicitudMedicamentos.current;
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
      if (action === 'reintegrar' && balance < 0.01) throw new Error('No queda seña pendiente de resolver.');
      setDetail(data);
      if (action === 'devolucion') setReturnForm(newReturn(remaining[0].id_detalle_prestamo));
      if (action === 'reintegrar') setMoneyForm({ ...newMoney(), monto: balance.toFixed(2) });
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
      const resultado = await method(payload);
      // Cerrar primero: una falla en la recarga no debe ofrecer repetir una escritura exitosa.
      setModal(''); setDetail(null);
      notify('success', 'Operación registrada correctamente.');
      await cargar({ silencioso: true });
      setAlertRevision(v => v + 1);
    } catch (e) { notify('error', e.message || 'No se pudo registrar la operación.'); }
    finally { guardandoRef.current = false; setSaving(false); }
  };

  const confirmarCierre = async () => {
    if (guardandoRef.current) return { ok: false, mensaje: 'Ya se está procesando una operación.' };
    guardandoRef.current = true;
    setSaving(true);
    try {
      const resultado = await api.cerrar({ id_prestamo: detail?.prestamo?.id_prestamo });
      // Se confirmó el cierre; una falla de lectura no debe repetir la escritura.
      void cargar({ silencioso: true });
      setAlertRevision(v => v + 1);
      return resultado;
    } finally {
      guardandoRef.current = false;
      setSaving(false);
    }
  };
  const cerrarConfirmacion = () => { setModal(''); setDetail(null); };
  const toastConfirmacion = (tipo, mensaje, duracion) => setFeedback({ type: tipo, message: mensaje, duration: duracion });

  const available = medicamentos.filter(m => num(m.activo) === 1 && num(m.stock_actual) > 0);
  const opts = [op('', 'Seleccionar medicamento'), ...available.map(m => op(m.id_medicamento, `${m.nombre_comercial} · ${m.dosis} · ${m.stock_actual} disponibles`))];
  const paymentOpts = [op('', 'Seleccionar medio'), ...medios.map(m => op(m.id_medio_pago, m.nombre))];
  const shown = registros;
  const pages = Math.max(1, Math.ceil((total || 0) / (por_pagina || 20)));
  useEffect(() => {
    if (!loading && !error && page > pages) setPage(pages);
  }, [loading, error, page, pages]);
  const details = detail?.detalle || [];
  const balance = saldoSena(detail?.senas);
  const remaining = faltanDevolver(details);
  const returnable = details.filter(d => num(d.cantidad_entregada) > num(d.cantidad_recibida));
  const chosenReturn = details.find(d => String(d.id_detalle_prestamo) === String(returnForm.id_detalle_prestamo));
  const returnMax = chosenReturn ? Math.max(0, num(chosenReturn.cantidad_entregada) - num(chosenReturn.cantidad_recibida)) : 0;
  const loanId = detail?.prestamo?.id_prestamo;

  return <>
    <ModulePage title="Medicamentos · Préstamos"
      description="Control de préstamos y devoluciones."
      headFiltersClassName="med-loans-filters"
      filters={[{ type: 'search', label: 'Búsqueda', value: query, onChange: setQuery, placeholder: ' ' },
        { type: 'select', label: 'Estado', className: 'med-filter--estado', value: status, onChange: v => { setStatus(v); setPage(1); }, options: [op('TODOS', 'TODOS'), op('ABIERTO', 'ABIERTOS'), op('CERRADO', 'CERRADOS')] }]}
      primaryActionLabel="Nuevo préstamo" onPrimaryAction={openLoan} canCreate={write}>
      {error ? <div className="med-inline-danger">{error}</div> : null}
      <GlobalDivTable ariaLabel="Préstamos de medicamentos" className={`med-table ${total > 0 ? 'has-bottom-pagination' : ''}`} empty={!loading && !error && !registros.length} gridClassName="med-grid--loans" loading={loading} columns={['Socio / documento', { label: 'Entrega / devolución', align: 'center' }, { label: 'Estado', align: 'center' }, 'Medicamentos', { label: 'Seña por resolver', align: 'right' }, { label: 'Acciones', align: 'center' }]}>
        {shown.map(p => {
          const { entregadas, devueltas, sinDevolver } = progresoMedicamentos(p);
          return <div className="mov-gridTable mov-gridTable--row global-divTable__row med-grid--loans" key={p.id_prestamo} role="row">
          <div className="mov-gridCell med-loan-person" role="cell"><div className="med-loan-cell-content" style={{ display: 'grid', gap: 3, minWidth: 0, width: '100%' }}><span className="med-loan-person__name" title={p.socio || undefined}>{p.socio || '—'}</span><span className="med-cell-secondary" title={p.documento ? `Documento: ${p.documento}` : undefined}>{p.documento ? `Documento: ${p.documento}` : 'Sin documento'}</span></div></div>
          <div className="mov-gridCell is-center med-loan-dates" role="cell">
            <strong>{fecha(p.fecha_entrega)}</strong>
            {p.fecha_devolucion_prevista ? <span className="med-cell-secondary">Prev.: {fecha(p.fecha_devolucion_prevista)}</span> : null}
          </div>
          <div className="mov-gridCell is-center" role="cell"><span className={`med-status-chip med-status-chip--${p.estado === 'ABIERTO' ? 'abierto' : p.estado === 'CERRADO' ? 'cerrado' : 'neutral'}`}>{p.estado}</span></div>
          <div className={`mov-gridCell med-loan-units${entregadas > 0 && sinDevolver === 0 ? ' med-loan-units--complete' : ''}`} role="cell">
            {entregadas > 0 ? <div className="med-loan-cell-content" style={{ display: 'grid', gap: 3, minWidth: 0, width: '100%' }}>
              <strong className="med-loan-units__returned">{devueltas} / {entregadas} devueltas</strong>
              <span>{sinDevolver === 0 ? 'Todo devuelto' : `${sinDevolver} ${p.estado === 'ABIERTO' ? 'por devolver' : 'sin devolver'}`}</span>
            </div> : '—'}
          </div>
          <div className="mov-gridCell is-right" role="cell">{dinero(saldoFila(p))}</div>
          <div className="mov-gridCell med-actions" role="cell">
            <IconAction icon={faCircleInfo} label={`Información del préstamo #${p.id_prestamo}`} onClick={() => openAction(p.id_prestamo, 'detalle')} disabled={fetchingId !== null || saving} />
            {write && p.estado === 'ABIERTO' ? <>
              <IconAction icon={faRotateLeft} label="Registrar devolución de medicamentos" onClick={() => openAction(p.id_prestamo, 'devolucion')} disabled={fetchingId !== null || saving} />
              {saldoFila(p) >= 0.01 ? <>
                <IconAction icon={faMoneyBillTransfer} label="Reintegrar seña" onClick={() => openAction(p.id_prestamo, 'reintegrar')} disabled={fetchingId !== null || saving} />
              </> : null}
              <IconAction icon={faLock} label="Finalizar préstamo" danger onClick={() => openAction(p.id_prestamo, 'cierre')} disabled={fetchingId !== null || saving} />
            </> : null}
          </div>
        </div>;
        })}
        {!loading && !error && !registros.length ? <div className="module-empty">
          <FontAwesomeIcon icon={faInbox} />
          <strong>Sin préstamos para mostrar</strong>
          <span>No hay préstamos que coincidan.</span>
        </div> : null}
      </GlobalDivTable>
      <GlobalPagination page={pagina} total={total} perPage={por_pagina} onPageChange={setPage} loading={loading} label="préstamos" />
    </ModulePage>
    <AlertasVencimientos tipo="PRESTAMO" actualizacion={alertRevision}
      onSelect={aviso => openAction(aviso.id_referencia, write ? 'cierre' : 'detalle')} />

    <CrudModal modalClassName="med-modal" closeOnBackdrop={false} open={modal === 'prestamo'} wide saving={saving} loading={cargandoMedicamentos} title={tituloAccion(faPills, 'Registrar préstamo de medicamentos')}
      onClose={cerrarPrestamoNuevo} submitDisabled={cargandoMedicamentos || available.length === 0}
      onSubmit={e => run(e, api.prestar, form)}>
      <MedicamentosTabs disabled={saving} tabs={[{ label: 'Socio y seña', icon: faMoneyBillTransfer }, { label: 'Medicamentos', icon: faPills }]}>
        <div><Campos>
        <BuscadorEntidad label="Socio que retira" required wide placeholder="Escribí nombre, apellido o DNI y seleccioná un socio..."
          value={form.id_socio} selectedLabel={chosenPerson?.nombre || ''} buscar={buscarSocios} onSelect={item => {
            setChosenPerson(item); setForm(f => ({ ...f, id_socio: item?.id_socio || '' }));
          }} />
        <Campo label="Fecha prevista de devolución (opcional)" type="date" min={fechaHoy()} value={form.fecha_devolucion_prevista} onChange={v => setForm(f => ({ ...f, fecha_devolucion_prevista: v }))} />
        <Campo label="Seña cobrada ($)" type="number" min="0" step="0.01" value={form.sena} onChange={v => setForm(f => ({ ...f, sena: v }))} />
        {num(form.sena) > 0 ? <Campo label="Medio de pago de seña" required value={form.id_medio_pago} options={paymentOpts} onChange={v => setForm(f => ({ ...f, id_medio_pago: v }))} /> : null}
</Campos></div>
        <div><Campos>        <div className="entity-field entity-field--wide med-loan-items"><MedSection icon={faPills}>Medicamentos entregados</MedSection>
          {form.items.map((item, i) => <div className="med-box med-med-editor" key={i}>
            <Campo className="med-med-editor__select" label={`Medicamento ${i + 1}`} required value={item.id_medicamento} options={opts} onChange={v => setForm(f => ({ ...f, items: f.items.map((r, k) => k === i ? { ...r, id_medicamento: v } : r) }))} />
              <Campo className="med-med-editor__quantity" label="Cantidad" required type="number" min="1" step="1" value={item.cantidad} onChange={v => setForm(f => ({ ...f, items: f.items.map((r, k) => k === i ? { ...r, cantidad: v } : r) }))} />
            {form.items.length > 1 ? <button className="med-mini med-mini--danger med-med-editor__remove" type="button" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, k) => k !== i) }))}>Quitar medicamento</button> : null}
          </div>)}
          <button type="button" className="med-mini med-loan-items__add" disabled={form.items.length >= 30} onClick={() => setForm(f => ({ ...f, items: [...f.items, { id_medicamento: '', cantidad: '1' }] }))}>+ Agregar otro medicamento</button>
        </div>
        <Campo label="Observaciones" wide textarea value={form.observaciones} onChange={v => setForm(f => ({ ...f, observaciones: v }))} />
</Campos>
      <p className="med-inline-note">El préstamo descuenta los medicamentos del stock y cobra la seña una sola vez.</p></div>
      </MedicamentosTabs>
    </CrudModal>

    {/* Detalle de solo lectura; estilos propios sin alterar el resto de modales. */}
    <CrudModal modalClassName="med-modal med-loan-detail-modal" closeOnBackdrop={false} open={modal === 'detalle'} wide hideSubmit title={tituloAccion(faCircleInfo, `Préstamo #${loanId || ''}`)}
      subtitle={detail?.prestamo?.socio || ''} onClose={() => setModal('')}>
      {detail ? <MedicamentosTabs tabs={[{ label: 'Medicamentos', icon: faPills }, { label: 'Seña', icon: faMoneyBillTransfer }]}><div className="med-loan-detail-content">
        <div className="med-loan-summary med-loan-detail-summary">
          <div className="med-loan-detail-stat med-loan-detail-stat--status">
            <span>Estado del préstamo</span>
            <strong><span className={`med-status-chip med-status-chip--${detail.prestamo.estado === 'ABIERTO' ? 'abierto' : 'cerrado'}`}>{detail.prestamo.estado}</span></strong>
          </div>
          <div className="med-loan-detail-stat med-loan-detail-stat--date">
            <span>Fecha de entrega</span><strong>{fecha(detail.prestamo.fecha_entrega)}</strong>
          </div>
          <div className="med-loan-detail-stat med-loan-detail-stat--balance">
            <span>Seña por resolver</span><strong>{dinero(balance)}</strong>
          </div>
        </div>
        <section className="med-box med-loan-detail-card med-loan-detail-card--meds">
          <div className="med-loan-detail-card__heading">
            <MedSection icon={faPills}>Medicamentos entregados</MedSection>
            <span className="med-loan-detail-count">{details.length} {details.length === 1 ? 'registro' : 'registros'}</span>
          </div>
          <div className="med-loan-detail-card__content">
            {details.map(d => <div className="med-detail-row med-loan-detail-item" key={d.id_detalle_prestamo}>
              <strong className="med-loan-detail-item__name">{d.nombre_comercial} · {d.dosis}</strong>
              <div className="med-loan-detail-quantities">
                <span className="med-loan-detail-quantity med-loan-detail-quantity--delivered">Entregado <strong>{d.cantidad_entregada}</strong></span>
                <span className="med-loan-detail-quantity med-loan-detail-quantity--returned">Devuelto <strong>{d.cantidad_recibida}</strong></span>
                <span className="med-loan-detail-quantity med-loan-detail-quantity--pending">Pendiente <strong>{Math.max(0, num(d.cantidad_entregada) - num(d.cantidad_recibida))}</strong></span>
              </div>
            </div>)}
          </div>
        </section>
        {detail.devoluciones.length > 0 ? <section className="med-box med-loan-detail-card med-loan-detail-card--returns">
          <div className="med-loan-detail-card__heading">
            <MedSection icon={faRotateLeft}>Devoluciones registradas</MedSection>
            <span className="med-loan-detail-count">{detail.devoluciones.length} {detail.devoluciones.length === 1 ? 'registro' : 'registros'}</span>
          </div>
          <div className="med-loan-detail-card__content">
            {detail.devoluciones.map(r => <div className="med-detail-row med-loan-detail-item" key={r.id_devolucion}>
              <div className="med-loan-detail-return-heading">
                <strong>{r.cantidad} {num(r.cantidad) === 1 ? 'unidad devuelta' : 'unidades devueltas'}</strong>
                <span className="med-loan-detail-date">{fecha(r.fecha_recepcion)}</span>
              </div>
              <div className="med-loan-detail-description">{r.observaciones || 'Stock devuelto al medicamento'}</div>
            </div>)}
          </div>
        </section> : null}
      </div><div className="med-loan-detail-content">
        <section className="med-box med-loan-detail-card med-loan-detail-card--deposit">
          <div className="med-loan-detail-card__heading">
            <MedSection icon={faMoneyBillTransfer}>Movimientos de seña</MedSection>
            <span className="med-loan-detail-count">{detail.senas.length} {detail.senas.length === 1 ? 'movimiento' : 'movimientos'}</span>
          </div>
          <div className="med-loan-detail-card__content">
            {detail.senas.length ? detail.senas.map(m => <div className="med-detail-row med-loan-detail-payment" key={m.id_movimiento_sena}>
              <div className="med-loan-detail-payment__info">
                <strong>{m.tipo === 'COBRO_SENA' ? 'Cobro' : m.tipo === 'DEVOLUCION_SENA' ? 'Reintegro' : 'Donación'}</strong>
                <span>{fecha(m.fecha_movimiento)}{m.medio_pago ? ` · ${m.medio_pago}` : ''}</span>
              </div>
              <strong className="med-loan-detail-payment__amount">{dinero(m.monto)}</strong>
            </div>) : <div className="med-empty med-empty--compact"><FontAwesomeIcon icon={faInbox} /><span>Sin movimientos de seña.</span></div>}
          </div>
        </section>
      </div></MedicamentosTabs> : null}
    </CrudModal>

    <CrudModal modalClassName="med-modal" closeOnBackdrop={false} open={modal === 'devolucion'} saving={saving} title={tituloAccion(faRotateLeft, 'Registrar devolución de medicamentos')}
      onClose={() => setModal('')} submitLabel="Registrar devolución"
      submitDisabled={!chosenReturn || returnMax < 1 || !Number.isInteger(Number(returnForm.cantidad)) || num(returnForm.cantidad) < 1 || num(returnForm.cantidad) > returnMax}
      onSubmit={e => run(e, api.devolver, returnForm)}>
      <MedSection icon={faRotateLeft}>Medicamentos recibidos</MedSection>
      <p className="med-loan-muted">Registrá lo que devuelve el socio. El stock se actualiza al guardar, sin pasos de aprobación.</p>
      <Campos>
        <Campo label="Medicamento devuelto" required value={returnForm.id_detalle_prestamo}
          options={returnable.map(d => op(d.id_detalle_prestamo, `${d.nombre_comercial} · ${d.dosis} · ${Math.max(0, num(d.cantidad_entregada) - num(d.cantidad_recibida))} pendientes`))}
          onChange={v => setReturnForm(f => ({ ...f, id_detalle_prestamo: v, cantidad: '1' }))} />
        <Campo label={`Cantidad recibida (máximo ${returnMax})`} type="number" min="1" step="1" required
          value={returnForm.cantidad} onChange={v => setReturnForm(f => ({ ...f, cantidad: v }))} />
        <Campo label="Observaciones" wide textarea value={returnForm.observaciones}
          onChange={v => setReturnForm(f => ({ ...f, observaciones: v }))} />
      </Campos>
      <p className="med-inline-note">La devolución de medicamentos no devuelve dinero automáticamente. La seña tiene sus propias acciones.</p>
    </CrudModal>

    <CrudModal modalClassName="med-modal" closeOnBackdrop={false} open={modal === 'reintegrar'} saving={saving} title={tituloAccion(faMoneyBillTransfer, 'Reintegrar seña')}
      onClose={() => setModal('')} submitLabel="Confirmar reintegro"
      onSubmit={e => run(e, api.sena, { ...moneyForm, tipo: 'DEVOLUCION_SENA', id_prestamo: loanId })}>
      <MedSection icon={faMoneyBillTransfer}>Datos del reintegro</MedSection>
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

    <ModalEliminarGlobal
      open={modal === 'cierre'}
      operacion="advertencia"
      tone="danger"
      icon={faLock}
      row={detail?.prestamo}
      title="Finalizar préstamo"
      message="Confirmá la finalización del préstamo. Después no se podrán registrar devoluciones de medicamentos ni reintegros de seña."
      warning="Las unidades no se descuentan nuevamente del stock. Si queda seña pendiente, LALCEC la conservará como donación, sin cobrarla otra vez."
      details={detail ? [
        { label: 'Préstamo', value: `#${loanId}` },
        { label: 'Socio', value: detail.prestamo?.socio || '—' },
        { label: 'Unidades sin devolver', value: remaining },
        { label: 'Seña que quedará donada', value: dinero(balance) },
      ] : []}
      confirmLabel="Finalizar préstamo"
      loadingLabel="Finalizando préstamo..."
      loadingMessage="Finalizando préstamo…"
      successMessage="Préstamo finalizado correctamente."
      errorMessage="No se pudo finalizar el préstamo."
      onClose={cerrarConfirmacion}
      onConfirm={confirmarCierre}
      onToast={toastConfirmacion}
      loading={saving}
    />

    {feedback ? <ModuleFeedback {...feedback} onClose={() => setFeedback(null)} /> : null}
  </>;
}
