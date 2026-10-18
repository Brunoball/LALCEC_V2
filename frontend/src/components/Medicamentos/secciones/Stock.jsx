import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBoxOpen, faClockRotateLeft, faArrowDown, faArrowUp,
  faPen, faBan, faRotateLeft, faPills, faMoneyBillTransfer, faInbox,
} from '@fortawesome/free-solid-svg-icons';
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
import { fecha, fechaHoy, dinero, num, MED_TIPOS } from '../utils/medicamentosUtils';
import { distribuirEgreso } from '../utils/medicamentosDistribucion';
import MedicamentosTabs, { MedSection } from '../modales/MedicamentosTabs';
import AlertasVencimientos from '../alertas/AlertasVencimientos';
import { tonoVencimiento } from '../utils/vencimientos';
import '../Medicamentos.css';

const newMedicine = () => ({
  droga: '', nombre_comercial: '', laboratorio: '', presentacion: 'COMPRIMIDOS',
  dosis: '', unidad_stock: 'UNIDAD', observaciones: '',
});
const newEntry = (id = '') => ({
  id_medicamento: id, origen: 'DONACION', fecha_ingreso: fechaHoy(),
  fecha_vencimiento: '', numero_lote: '', procedencia: '', cantidad: '1',
  costo_unitario: '', id_medio_pago: '', observaciones: '',
});
const newOut = (tipo = 'ENTREGA_DONACION') => ({
  tipo, cantidad: '1',
  id_medio_pago: '', importe: '', detalle: '',
});
const OUT_TYPES = ['ENTREGA_DONACION', 'SALIDA_VENTA', 'AJUSTE_SALIDA', 'BAJA_VENCIMIENTO', 'BAJA_DESCARTE'];
const originName = { DONACION: 'Donación', COMPRA: 'Compra', INICIAL: 'Stock inicial', DEVOLUCION: 'Devolución', AJUSTE: 'Ajuste' };
const statusName = { ACTIVO: 'Activo', BLOQUEADO: 'Bloqueado', DESCARTADO: 'Descartado' };
// La pestaña depende únicamente de la baja del medicamento, no de sus lotes.
// Los lotes bloqueados y vencidos se muestran como información dentro de Activos.
const estadoVisible = m => {
  if (num(m.activo) !== 1) return 'Dado de baja';
  const notas = [];
  const bloqueados = num(m.lotes_bloqueados);
  const vencidos = num(m.lotes_vencidos);
  if (bloqueados > 0) notas.push(`${bloqueados} ${bloqueados === 1 ? 'lote bloqueado' : 'lotes bloqueados'}`);
  if (vencidos > 0) notas.push(`${vencidos} ${vencidos === 1 ? 'lote vencido' : 'lotes vencidos'}`);
  if (num(m.lotes) === 0) notas.push('Sin lotes cargados');
  else if (num(m.stock_utilizable) === 0) notas.push('Sin stock disponible');
  return notas.join(' · ');
};
// Mantener coherencia entre el estado real del lote, su chip y el detalle visual.
const tonoLote = lot => lot.estado === 'DESCARTADO' ? 'descartado'
  : lot.fecha_vencimiento < fechaHoy() ? 'vencido'
  : lot.estado === 'BLOQUEADO' ? 'bloqueado' : 'vigente';
const situacionLote = lot => lot.fecha_vencimiento < fechaHoy()
  ? (lot.estado === 'BLOQUEADO' ? 'BLOQUEADO Y VENCIDO' : lot.estado === 'DESCARTADO' ? 'DESCARTADO' : 'VENCIDO')
  : (statusName[lot.estado] || lot.estado);

// Se egresa desde el medicamento; para entregar o vender solo se usan lotes
// vigentes, mientras que los descartes pueden descontarse de lotes bloqueados o vencidos.

async function buscarProcedencias(buscar) {
  const response = await api.procedencias(buscar);
  return response.registros || [];
}

function StockEntryFields({ entry, setEntry, medios, isFirst = false, saving = false }) {
  const update = (key, value) => setEntry(v => ({ ...v, [key]: value }));
  const paymentOptions = [op('', 'Seleccionar medio'), ...medios.map(m => op(m.id_medio_pago, m.nombre))];
  // En el alta inicial, lote y procedencia comparten la tercera fila del
  // formulario. En ingresos posteriores, la procedencia sigue en su pestaña.
  const donorField = <BuscadorEntidad label="Donante / proveedor (opcional)" manual
    value={entry.procedencia} selectedLabel={entry.procedencia}
    buscar={buscarProcedencias} onSelect={item => update('procedencia', item?.nombre || '')} />;
  const lotFields = <Campos>
      <Campo label="Origen" required options={[op('DONACION', 'Donación'), op('COMPRA', 'Compra'), ...(isFirst ? [op('INICIAL', 'Stock inicial')] : [])]} value={entry.origen} onChange={v => update('origen', v)} />
      <Campo label="Cantidad" type="number" required min="1" step="1" value={entry.cantidad} onChange={v => update('cantidad', v)} />
      <Campo label="Fecha de ingreso" type="date" required value={entry.fecha_ingreso} onChange={v => update('fecha_ingreso', v)} />
      <Campo label="Fecha de vencimiento" type="date" required min={entry.fecha_ingreso || fechaHoy()} value={entry.fecha_vencimiento} onChange={v => update('fecha_vencimiento', v)} />
      <Campo label="Número de lote (opcional)" value={entry.numero_lote} onChange={v => update('numero_lote', v)} />
      {isFirst ? donorField : null}
  </Campos>;
  const originFields = <Campos>
      {!isFirst ? donorField : null}
      {entry.origen === 'COMPRA' ? <>
        <Campo label="Costo por unidad ($)" type="number" required min="0.01" step="0.01" value={entry.costo_unitario} onChange={v => update('costo_unitario', v)} />
        <Campo label="Medio de pago de la compra" required options={paymentOptions} value={entry.id_medio_pago} onChange={v => update('id_medio_pago', v)} />
        <p className="med-inline-note">La compra registrará un egreso de {dinero(num(entry.cantidad) * num(entry.costo_unitario))} en Contabilidad.</p>
      </> : null}
      <Campo label="Observaciones del ingreso" wide textarea value={entry.observaciones} onChange={v => update('observaciones', v)} />
</Campos>;
  if (isFirst) return <>{lotFields}{originFields}</>;
  return <MedicamentosTabs disabled={saving} tabs={[{ label: 'Lote y cantidad', icon: faBoxOpen }, { label: 'Origen y costo', icon: faMoneyBillTransfer }]}>
    <div>{lotFields}</div><div>{originFields}</div>
  </MedicamentosTabs>;
}

function ActionButton({ icon, label, onClick, danger = false, disabled = false }) {
  return <button type="button" className={`med-mini med-icon-action${danger ? ' med-mini--danger' : ''}`}
    aria-label={label} title={label} onClick={onClick} disabled={disabled}>
    <FontAwesomeIcon icon={icon} /><span className="med-action-label">{label}</span>
  </button>;
}

export default function Stock() {
  const loader = useCallback(() => api.catalogo(), []);
  const { registros, loading, error, cargar } = useMedicamentos(loader);
  const [medios, setMedios] = useState([]);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState('ACTIVOS');
  const [lotTarget, setLotTarget] = useState(null);
  const [loteResaltado, setLoteResaltado] = useState(null);
  const [alertRevision, setAlertRevision] = useState(0);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [selected, setSelected] = useState(null);
  const [med, setMed] = useState(newMedicine);
  const [entry, setEntry] = useState(newEntry);
  const [out, setOut] = useState(newOut);
  const [loteSalida, setLoteSalida] = useState(null);
  const [lots, setLots] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [anular, setAnular] = useState(null);
  const [reintegroMedio, setReintegroMedio] = useState('');
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [confirmarDevolucion, setConfirmarDevolucion] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const viewRequest = useRef(0);
  const guardandoRef = useRef(false);
  const write = canWrite();
  const notify = (type, message) => setFeedback({ type, message });

  useEffect(() => {
    let active = true;
    api.medios().then(data => { if (active) setMedios(data.registros || []); })
      .catch(e => { if (active) setFeedback({ type: 'error', message: e.message }); });
    return () => { active = false; };
  }, []);

  const loadLots = async (medicine) => {
    const request = ++viewRequest.current;
    setDetailLoading(true);
    try {
      const data = await api.lotes({ id_medicamento: medicine.id_medicamento });
      const items = data.registros || [];
      if (request === viewRequest.current) setLots(items);
      return items;
    } catch (e) {
      if (request === viewRequest.current) notify('error', e.message || 'No se pudieron cargar los lotes.');
      return [];
    } finally { if (request === viewRequest.current) setDetailLoading(false); }
  };

  const openMed = (medicine = null) => {
    ++viewRequest.current;
    setSelected(medicine);
    setMed(medicine ? { ...newMedicine(), ...Object.fromEntries(Object.keys(newMedicine()).map(key => [key, medicine[key] ?? ''])), id_medicamento: medicine.id_medicamento } : newMedicine());
    setEntry(newEntry());
    setModal('med');
  };
  const openEntry = (medicine) => {
    ++viewRequest.current;
    setSelected(medicine);
    setEntry(newEntry(medicine.id_medicamento));
    setModal('entry');
  };
  const openLots = (medicine, loteAviso = null) => {
    setLoteResaltado(loteAviso);
    setSelected(medicine);
    setLots([]);
    setModal('lotes');
    loadLots(medicine);
  };
  const openOut = async (medicine, tipoInicial = null, loteSeleccionado = null) => {
    const request = ++viewRequest.current;
    setSelected(medicine);
    setLoteSalida(loteSeleccionado);
    setLots([]);
    setOut(newOut(tipoInicial || (num(medicine.activo) === 1 && num(medicine.stock_utilizable) > 0 ? 'ENTREGA_DONACION' : num(medicine.stock_vencido) > 0 ? 'BAJA_VENCIMIENTO' : 'BAJA_DESCARTE')));
    setModal('out');
    setDetailLoading(true);
    try {
      const response = await api.lotes({ id_medicamento: medicine.id_medicamento });
      const items = response.registros || [];
      if (request !== viewRequest.current) return;
      setLots(items);
    } catch (e) { if (request === viewRequest.current) notify('error', e.message || 'No se pudieron cargar los lotes.'); }
    finally { if (request === viewRequest.current) setDetailLoading(false); }
  };
  const fetchHistory = async (medicine, pagina) => {
    const request = ++viewRequest.current;
    setDetailLoading(true);
    try {
      const response = await api.historial({ id_medicamento: medicine.id_medicamento, pagina });
      if (request !== viewRequest.current) return;
      setHistory(response.registros || []);
      setHistoryTotal(num(response.total));
      setHistoryPage(num(response.pagina) || pagina);
    } catch (e) { if (request === viewRequest.current) notify('error', e.message || 'No se pudo cargar el historial.'); }
    finally { if (request === viewRequest.current) setDetailLoading(false); }
  };
  const openAnular = (movimiento) => {
    ++viewRequest.current;
    setAnular(movimiento);
    setReintegroMedio('');
    setMotivoAnulacion('');
    setConfirmarDevolucion(false);
    setConfirmation('anular');
  };
  const openHistory = (medicine) => {
    setSelected(medicine);
    setHistory([]);
    setHistoryPage(1);
    setHistoryTotal(0);
    setModal('history');
    fetchHistory(medicine, 1);
  };

  const run = async (event, handler, payload) => {
    event.preventDefault();
    if (guardandoRef.current) return;
    guardandoRef.current = true;
    setSaving(true);
    try {
      await handler(payload);
      ++viewRequest.current;
      setModal('');
      setSelected(null);
      notify('success', 'Operación registrada correctamente.');
      await cargar();
      setAlertRevision(v => v + 1);
    } catch (e) { notify('error', e.message || 'No se pudo guardar.'); }
    finally { guardandoRef.current = false; setSaving(false); }
  };
  // Las confirmaciones destructivas usan el modal global. No reutilizamos run():
  // esa función captura errores para los formularios y el modal global necesita
  // recibirlos para mantener la confirmación abierta y mostrar el mensaje real.
  const confirmarOperacion = async (handler, payload) => {
    if (guardandoRef.current) return { ok: false, mensaje: 'Ya se está procesando una operación.' };
    guardandoRef.current = true;
    setSaving(true);
    try {
      const resultado = await handler(payload);
      ++viewRequest.current;
      // La escritura ya se confirmó: una falla al actualizar la lista no debe
      // permitir reenviar el movimiento contable o el cambio de estado.
      void cargar({ silencioso: true });
      setAlertRevision(v => v + 1);
      if (modal === 'lotes' && selected) await loadLots(selected);
      if (modal === 'history' && selected) await fetchHistory(selected, historyPage);
      return resultado;
    } finally {
      guardandoRef.current = false;
      setSaving(false);
    }
  };
  const closeConfirmation = () => {
    ++viewRequest.current;
    setConfirmation('');
    if (!modal) setSelected(null);
    setLotTarget(null);
    setAnular(null);
  };
  const toastConfirmation = (tipo, mensaje, duracion) => setFeedback({ type: tipo, message: mensaje, duration: duracion });
  const openStatus = (medicine) => {
    ++viewRequest.current;
    setSelected(medicine);
    setConfirmation('estado');
  };
  const openLotStatus = (lot) => {
    ++viewRequest.current;
    setLotTarget(lot);
    setConfirmation('lote_estado');
  };

  const activos = useMemo(() => registros.filter(m => num(m.activo) === 1), [registros]);
  const bajas = useMemo(() => registros.filter(m => num(m.activo) !== 1), [registros]);
  const filtered = useMemo(() => (section === 'ACTIVOS' ? activos : bajas).filter(m =>
    [m.nombre_comercial, m.droga, m.laboratorio, m.presentacion, m.dosis]
      .some(field => String(field || '').toUpperCase().includes(query.trim().toUpperCase()))
  ), [activos, bajas, section, query]);
  const maxPage = Math.max(1, Math.ceil(filtered.length / 20));
  const shown = filtered.slice((Math.min(page, maxPage) - 1) * 20, Math.min(page, maxPage) * 20);
  useEffect(() => { if (page > maxPage) setPage(maxPage); }, [page, maxPage]);
  const cantidadValida = Number.isInteger(Number(out.cantidad)) && num(out.cantidad) > 0;
  const lotesParaSalida = loteSalida ? lots.filter(l => String(l.id_lote) === String(loteSalida)) : lots;
  const planEgreso = distribuirEgreso(lotesParaSalida, out.tipo, cantidadValida ? num(out.cantidad) : 0, fechaHoy());
  const stockSuficiente = cantidadValida && planEgreso.suficiente;
  useEffect(() => {
    if (modal !== 'lotes' || !loteResaltado || !lots.length) return undefined;
    const timer = window.setTimeout(() => document.getElementById(`med-lote-${loteResaltado}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 120);
    return () => window.clearTimeout(timer);
  }, [modal, loteResaltado, lots]);
  const abrirAlertaLote = async (aviso) => {
    let medicine = registros.find(m => String(m.id_medicamento) === String(aviso.id_medicamento));
    if (!medicine) {
      const response = await api.catalogo();
      medicine = (response.registros || []).find(m => String(m.id_medicamento) === String(aviso.id_medicamento));
    }
    if (!medicine) throw new Error('El medicamento ya no existe. Actualizá las alertas.');
    openLots(medicine, aviso.id_referencia);
  };
  const close = () => { if (saving) return; if (confirmation) { closeConfirmation(); return; } if (!saving) { ++viewRequest.current; setModal(''); setSelected(null); } };
  const updateMed = (key, value) => setMed(m => ({ ...m, [key]: value }));
  const updateOut = (key, value) => setOut(o => ({ ...o, [key]: value }));

  return <>
    <ModulePage title="Medicamentos · Stock" tabsInTitle
      filters={[
        { type: 'tabs', label: 'Estado del stock', value: section, onChange: v => { setSection(v); setPage(1); }, options: [
          { value: 'ACTIVOS', label: 'Activos', count: activos.length },
          { value: 'BAJAS', label: 'Bajas', count: bajas.length },
        ] },
        { type: 'search', label: 'Búsqueda', value: query, onChange: v => { setQuery(v); setPage(1); }, placeholder: ' ' },
      ]}
      primaryActionLabel="Nuevo medicamento" onPrimaryAction={() => openMed()}
      canCreate={write}>
      {error ? <div className="med-inline-danger">{error}</div> : null}
      <GlobalDivTable ariaLabel="Stock de medicamentos" loading={loading}
        className={`med-table ${filtered.length ? 'has-bottom-pagination' : ''}`} empty={!loading && !error && !filtered.length} gridClassName="med-grid--stock"
        columns={['Medicamento / droga', 'Laboratorio', 'Presentación / dosis', 'Disponible', 'Últ. ingreso / origen', { label: 'Vencimiento', align: 'center' }, { label: 'Acciones', align: 'center' }]}>
        {shown.map(m => <div key={m.id_medicamento}
          className={`mov-gridTable mov-gridTable--row global-divTable__row med-grid--stock med-expiry-row is-${tonoVencimiento(m.vencimiento_referencia)}`}
          role="row" title={m.vencimiento_referencia ? `Vencimiento del stock: ${fecha(m.vencimiento_referencia)}` : 'Sin vencimiento aplicable al stock existente'}>
          <div role="cell" className="mov-gridCell entity-main-cell" title={m.droga}>
            <strong>{m.nombre_comercial}</strong>
            <span className="med-cell-secondary">{m.droga}</span>
            {estadoVisible(m) ? <span className={`med-cell-secondary med-situacion${num(m.activo) === 1 ? '' : ' med-situacion--baja'}`}>{estadoVisible(m)}</span> : null}
          </div>
          <div role="cell" className="mov-gridCell">{m.laboratorio || '—'}</div>
          <div role="cell" className="mov-gridCell entity-main-cell">
            <span className="med-stock-presentation" title={m.presentacion || ''}>{m.presentacion || '—'}</span>
            <span className="med-cell-secondary" title={m.dosis || ''}>Dosis: {m.dosis || '—'}</span>
          </div>
          <div role="cell" className="mov-gridCell entity-main-cell med-stock-availability">
            <div className="med-stock-amount">
              <strong>{m.stock_utilizable}</strong>
              <span className="med-stock-unit">{m.unidad_stock || '—'}</span>
            </div>
            <span className="med-stock-caption">Disponibles</span>
            {(num(m.stock_total) > num(m.stock_utilizable) || num(m.stock_cuarentena) > 0) ? (
              <div className="med-stock-details">
                {num(m.stock_total) > num(m.stock_utilizable) ? <>
                  <span>En existencia: <b>{m.stock_total}</b></span>
                  <span>No disponibles: <b>{num(m.stock_total) - num(m.stock_utilizable)}</b></span>
                </> : null}
                {num(m.stock_cuarentena) > 0 ? <span>Devoluciones sin incorporar: <b>{m.stock_cuarentena}</b></span> : null}
              </div>
            ) : null}
          </div>
          <div role="cell" className="mov-gridCell entity-main-cell">{fecha(m.ultimo_ingreso)}<span className="med-cell-secondary">{originName[m.ultimo_origen] || '—'}</span></div>
          <div role="cell" className="mov-gridCell is-center med-expiry-cell"><span className="med-expiry-date">{fecha(m.vencimiento_referencia)}</span></div>
          <div role="cell" className="mov-gridCell med-actions">
            <ActionButton icon={faBoxOpen} label="Lotes y vencimientos" onClick={() => openLots(m)} />
            <ActionButton icon={faClockRotateLeft} label="Historial" onClick={() => openHistory(m)} />
            {write ? <>
              <ActionButton icon={faArrowDown} label="Ingresar stock" onClick={() => openEntry(m)} disabled={num(m.activo) !== 1 || saving} />
              <ActionButton icon={faArrowUp} label="Egresar stock" onClick={() => openOut(m)} disabled={num(m.stock_total) <= 0 || saving} />
              <ActionButton icon={faPen} label="Editar" onClick={() => openMed(m)} disabled={saving} />
              <ActionButton icon={num(m.activo) === 1 ? faBan : faRotateLeft} label={num(m.activo) === 1 ? 'Dar de baja' : 'Reactivar'} onClick={() => openStatus(m)} danger={num(m.activo) === 1} disabled={saving} />
            </> : null}
          </div>
        </div>)}
        {!loading && !error && !filtered.length ? <div className="module-empty">
          <FontAwesomeIcon icon={faInbox} />
          <strong>Sin medicamentos para mostrar</strong>
          <span>{section === 'ACTIVOS' ? 'No hay medicamentos activos que coincidan.' : 'No hay medicamentos dados de baja que coincidan.'}</span>
        </div> : null}
      </GlobalDivTable>
      <div className="med-stock-footer">
      <div className="med-expiry-legend" aria-label="Referencias de vencimiento">
        <strong>VENCIMIENTOS</strong>
        <span><i className="is-danger" />Rojo: vencido</span>
        <span><i className="is-warning" />Amarillo: vence hoy o dentro de 30 días</span>
        <span><i className="is-safe" />Verde: faltan más de 30 días</span>
        <span><i className="is-neutral" />Gris: sin vencimiento aplicable</span>
      </div>
      <GlobalPagination page={page} onPageChange={setPage} total={filtered.length} loading={loading} label="medicamentos" />
      </div>
    </ModulePage>
    <AlertasVencimientos tipo="LOTE" onSelect={abrirAlertaLote} actualizacion={alertRevision} />

    <CrudModal modalClassName="med-modal" closeOnBackdrop={false} open={modal === 'med'} wide saving={saving}
      title={med.id_medicamento ? 'Editar medicamento' : 'Nuevo medicamento'}
      subtitle={med.id_medicamento ? 'Los ingresos anteriores y sus vencimientos se consultan en Lotes y vencimientos.' : 'Completá el medicamento y su primera cantidad en un solo formulario.'}
      onClose={close}
      onSubmit={e => run(e, api.guardar, med.id_medicamento ? med : { ...med, ingreso_inicial: entry })}>
      <MedicamentosTabs key={med.id_medicamento || 'nuevo'} disabled={saving}
        tabs={med.id_medicamento ? [{ label: 'Medicamento', icon: faPills }] : [{ label: 'Medicamento', icon: faPills }, { label: 'Primer ingreso', icon: faBoxOpen }]}>
        <div>
      <Campos>
        <Campo label="Nombre comercial" required value={med.nombre_comercial} onChange={v => updateMed('nombre_comercial', v)} />
        <Campo label="Droga" required disabled={Boolean(med.id_medicamento && num(selected?.lotes) > 0)} value={med.droga} onChange={v => updateMed('droga', v)} />
        <Campo label="Laboratorio" value={med.laboratorio} onChange={v => updateMed('laboratorio', v)} />
        <Campo label="Presentación" required disabled={Boolean(med.id_medicamento && num(selected?.lotes) > 0)} options={[...new Set([med.presentacion, 'COMPRIMIDOS', 'INYECTABLES', 'JARABE', 'CÁPSULAS', 'GOTAS', 'CREMA', 'SOBRES', 'OTRA'].filter(Boolean))].map(x => op(x, x))} value={med.presentacion} onChange={v => updateMed('presentacion', v)} />
        <Campo label="Dosis" required disabled={Boolean(med.id_medicamento && num(selected?.lotes) > 0)} value={med.dosis} onChange={v => updateMed('dosis', v)} />
        <Campo label="Unidad de stock" required disabled={Boolean(med.id_medicamento && num(selected?.lotes) > 0)} options={[...new Set([med.unidad_stock, 'UNIDAD', 'CAJA', 'FRASCO', 'AMPOLLA', 'BLÍSTER'].filter(Boolean))].map(x => op(x, x))} value={med.unidad_stock} onChange={v => updateMed('unidad_stock', v)} />
        <Campo label="Observaciones del medicamento" wide textarea value={med.observaciones} onChange={v => updateMed('observaciones', v)} />
      </Campos>
      {med.id_medicamento && num(selected?.lotes) > 0 ? <p className="med-inline-note">Droga, presentación, dosis y unidad permanecen fijas para conservar la integridad del historial. Para otra presentación, creá un medicamento nuevo.</p> : null}
        </div>
        {!med.id_medicamento ? <div><StockEntryFields entry={entry} setEntry={setEntry} medios={medios} saving={saving} isFirst /></div> : null}
      </MedicamentosTabs>
    </CrudModal>

    <CrudModal modalClassName="med-modal" closeOnBackdrop={false} open={modal === 'entry'} wide saving={saving}
      title={`Ingresar stock · ${selected?.nombre_comercial || ''}`}
      subtitle="Cada nuevo ingreso conserva su fecha, origen y vencimiento."
      onClose={close} onSubmit={e => run(e, api.ingresar, entry)}>
      <StockEntryFields entry={entry} setEntry={setEntry} medios={medios} saving={saving} />
    </CrudModal>

    <CrudModal modalClassName="med-modal" closeOnBackdrop={false} open={modal === 'lotes'} wide hideSubmit
      loading={detailLoading} title={`Lotes y vencimientos · ${selected?.nombre_comercial || ''}`}
      subtitle={`${selected?.droga || ''} · ${selected?.presentacion || ''} · ${selected?.dosis || ''}`}
      onClose={close}>
      <MedSection icon={faBoxOpen}>Lotes y vencimientos</MedSection>
      {lots.length ? <div className="med-lot-list">{lots.map(l => <section id={`med-lote-${l.id_lote}`} className={`med-box med-lot-card med-lot-card--${tonoLote(l)}${String(loteResaltado) === String(l.id_lote) ? ' med-lot-card--alerta' : ''}`} key={l.id_lote}>
        <div className="med-lot-heading"><strong>Lote {l.numero_lote || `#${l.id_lote}`}</strong><div className="med-lot-heading__summary"><span className="med-lot-available"><small>Disponible</small><strong>{l.cantidad_disponible} {l.unidad_stock}</strong></span><span className={`med-lot-status med-status-chip med-status-chip--${tonoLote(l)}`}>{situacionLote(l)}</span></div></div>
        <div className="med-lot-data">
          <div><small>Fecha de ingreso</small><strong>{fecha(l.fecha_ingreso)}</strong></div>
          <div className="med-lot-data__expiry"><small>Vencimiento</small><strong>{fecha(l.fecha_vencimiento)}</strong></div>
          <div><small>Origen</small><strong>{originName[l.origen] || l.origen}</strong></div>
          {num(l.cantidad_cuarentena) > 0 ? <div><small>Devoluciones anteriores sin incorporar</small><strong>{l.cantidad_cuarentena}</strong></div> : null}
          <div className="med-lot-data__provider"><small>Donante / proveedor</small><strong>{l.procedencia || '—'}</strong></div>
          {l.origen === 'COMPRA' ? <div><small>Costo unitario</small><strong>{dinero(l.costo_unitario)}</strong></div> : null}
        </div>
        {l.observaciones ? <div className="med-lot-notes"><small>Observaciones</small><p>{l.observaciones}</p></div> : null}
        {write && l.estado !== 'DESCARTADO' ? <div className="med-actions med-lot-card__actions">
          {l.fecha_vencimiento < fechaHoy() && num(l.cantidad_disponible) > 0 ?
            <ActionButton icon={faArrowUp} label="Registrar baja por vencimiento" onClick={() => openOut(selected, 'BAJA_VENCIMIENTO', l.id_lote)} disabled={saving} /> : null}
          <ActionButton icon={l.estado === 'ACTIVO' ? faBan : faRotateLeft}
            label={l.estado === 'ACTIVO' ? 'Bloquear lote' : 'Desbloquear lote'}
            onClick={() => openLotStatus(l)}
            disabled={saving || (l.estado === 'BLOQUEADO' && l.fecha_vencimiento < fechaHoy())} />
          {l.estado === 'BLOQUEADO' && l.fecha_vencimiento < fechaHoy() ? <span className="med-cell-secondary">Vencido: no se puede desbloquear.</span> : null}
        </div> : null}
      </section>)}</div> : !detailLoading ? <div className="med-empty"><FontAwesomeIcon icon={faInbox} /><span>Este medicamento todavía no tiene lotes.</span></div> : null}
    </CrudModal>

    <CrudModal modalClassName="med-modal med-history-modal" closeOnBackdrop={false} open={modal === 'history'} wide hideSubmit
      loading={detailLoading} title={`Historial · ${selected?.nombre_comercial || ''}`}
      subtitle="Movimientos registrados únicamente para este medicamento."
      footerStart={<GlobalPagination page={historyPage} onPageChange={p => fetchHistory(selected, p)} total={historyTotal} perPage={50} loading={detailLoading} label="movimientos" />}
      onClose={close}>
      <MedSection icon={faClockRotateLeft}>Movimientos del medicamento</MedSection>
      {history.length ? <div className="med-history-list">{history.map(h => <div className="med-history-row" key={h.id_movimiento}>
        <div className="med-history-details"><strong>{MED_TIPOS[h.tipo] || h.tipo}</strong>
          <span>{String(h.fecha_movimiento || '').slice(0, 16)} · Lote {h.numero_lote || h.id_lote} · Vence {fecha(h.fecha_vencimiento)}</span>
          {h.detalle ? <span>{h.detalle}</span> : null}
          {num(h.anulada) === 1 ? <span>Operación anulada con contramovimientos.</span> : null}
        </div>
        <div className="med-history-quantity"><strong>{h.cantidad} unidades</strong><small>Disponible: {num(h.variacion_disponible) > 0 ? '+' : ''}{h.variacion_disponible}</small>{num(h.variacion_cuarentena) !== 0 ? <small>Registro anterior: {num(h.variacion_cuarentena) > 0 ? '+' : ''}{h.variacion_cuarentena}</small> : null}
          {write && !num(h.anulada) && ['INGRESO_COMPRA','SALIDA_VENTA'].includes(h.tipo) && (h.id_ingreso_contable || h.id_egreso_contable) ?
            <button type="button" className="med-anular-link" disabled={saving} onClick={() => openAnular(h)}>Anular operación</button> : null}
        </div>
      </div>)}</div> : !detailLoading ? <div className="med-empty"><FontAwesomeIcon icon={faInbox} /><span>No hay movimientos registrados.</span></div> : null}
    </CrudModal>

    <ModalEliminarGlobal
      open={confirmation === 'anular'}
      operacion="advertencia"
      tone="danger"
      icon={faBan}
      row={anular}
      title={anular?.tipo === 'INGRESO_COMPRA' ? 'Anular compra de medicamentos' : 'Anular venta de medicamentos'}
      message="Confirmá la anulación y el reintegro correspondiente. Se conservarán los asientos originales y se registrarán contramovimientos."
      warning="Antes de confirmar, verificá la devolución física y el reintegro del dinero. El backend rechazará una compra cuyo lote ya se haya utilizado; los productos devueltos de una venta ingresarán bloqueados."
      details={anular ? [
        { label: 'Movimiento', value: `#${anular.id_movimiento}` },
        { label: 'Operación', value: MED_TIPOS[anular.tipo] || anular.tipo },
        { label: 'Lote', value: anular.numero_lote || `#${anular.id_lote || '—'}` },
      ] : []}
      confirmLabel="Registrar anulación"
      loadingLabel="Anulando..."
      loadingMessage="Registrando anulación y contramovimientos…"
      successMessage="Operación anulada correctamente."
      errorMessage="No se pudo anular la operación."
      confirmDisabled={!reintegroMedio || motivoAnulacion.trim().length < 10 || !confirmarDevolucion}
      onClose={closeConfirmation}
      onConfirm={() => confirmarOperacion(api.anular, {
        id_movimiento: anular?.id_movimiento,
        motivo: motivoAnulacion.trim().toLocaleUpperCase('es-AR'),
        id_medio_pago: reintegroMedio,
        devolucion_confirmada: confirmarDevolucion,
      })}
      onToast={toastConfirmation}
      loading={saving}
      extraContent={<div className="med-global-confirm-fields">
        <Campos>
          <Campo label="Medio de pago utilizado para el reintegro" required options={[op('', 'Seleccionar medio'), ...medios.map(m => op(m.id_medio_pago, m.nombre))]} value={reintegroMedio} onChange={setReintegroMedio} disabled={saving} />
          <Campo label="Motivo documentado de anulación (mínimo 10 caracteres)" wide required textarea value={motivoAnulacion} onChange={value => setMotivoAnulacion(value.toLocaleUpperCase('es-AR'))} disabled={saving} />
        </Campos>
        <label className="med-anular-confirmacion"><input type="checkbox" checked={confirmarDevolucion} onChange={e => setConfirmarDevolucion(e.target.checked)} disabled={saving} /> Confirmo la devolución física de todas las unidades y el reintegro total del dinero.</label>
      </div>}
    />

    <ModalEliminarGlobal
      open={confirmation === 'estado'}
      operacion={num(selected?.activo) === 1 ? 'baja' : 'alta'}
      row={selected}
      title={num(selected?.activo) === 1 ? 'Dar de baja medicamento' : 'Reactivar medicamento'}
      message={num(selected?.activo) === 1
        ? 'Este medicamento dejará de estar disponible para nuevos ingresos, ventas y préstamos.'
        : 'El medicamento volverá a estar activo. Cada lote conservará su estado y su vencimiento.'}
      warning={num(selected?.activo) === 1
        ? 'La baja no elimina lotes ni movimientos históricos. Podrás reactivarlo posteriormente.'
        : 'Los lotes bloqueados o vencidos no se habilitan automáticamente.'}
      details={selected ? [
        { label: 'Medicamento', value: selected.nombre_comercial },
        { label: 'Presentación', value: `${selected.presentacion || '—'} · ${selected.dosis || '—'}` },
        { label: 'Estado actual', value: num(selected.activo) === 1 ? 'Activo' : 'Dado de baja' },
      ] : []}
      confirmLabel={num(selected?.activo) === 1 ? 'Dar de baja' : 'Reactivar'}
      loadingLabel={num(selected?.activo) === 1 ? 'Dando de baja...' : 'Reactivando...'}
      loadingMessage="Actualizando estado del medicamento…"
      successMessage={num(selected?.activo) === 1 ? 'Medicamento dado de baja correctamente.' : 'Medicamento reactivado correctamente.'}
      errorMessage="No se pudo actualizar el estado del medicamento."
      onClose={closeConfirmation}
      onConfirm={() => confirmarOperacion(api.cambiarEstado, {
        id_medicamento: selected?.id_medicamento,
        activo: num(selected?.activo) === 1 ? 0 : 1,
      })}
      onToast={toastConfirmation}
      loading={saving}
    />

    <ModalEliminarGlobal
      open={confirmation === 'lote_estado'}
      operacion={lotTarget?.estado === 'ACTIVO' ? 'baja' : 'alta'}
      row={lotTarget}
      title={lotTarget?.estado === 'ACTIVO' ? 'Bloquear lote' : 'Desbloquear lote'}
      message={lotTarget?.estado === 'ACTIVO'
        ? 'El lote dejará de estar disponible para entregas, ventas y préstamos.'
        : 'El lote recuperará su estado activo solo si todavía no está vencido.'}
      warning={lotTarget?.estado === 'ACTIVO'
        ? 'Bloquear un lote no elimina su stock ni su historial.'
        : num(selected?.activo) === 1
          ? 'Este lote podrá utilizarse si todavía está vigente y dispone de existencias.'
          : 'El medicamento sigue dado de baja: desbloquear el lote no habilita su utilización.'}
      details={lotTarget ? [
        { label: 'Medicamento', value: selected?.nombre_comercial || '—' },
        { label: 'Lote', value: lotTarget.numero_lote || `#${lotTarget.id_lote}` },
        { label: 'Estado actual', value: statusName[lotTarget.estado] || lotTarget.estado },
        { label: 'Vencimiento', value: fecha(lotTarget.fecha_vencimiento) },
      ] : []}
      confirmLabel={lotTarget?.estado === 'ACTIVO' ? 'Bloquear lote' : 'Desbloquear lote'}
      loadingLabel="Actualizando lote..."
      loadingMessage="Actualizando estado del lote…"
      successMessage="Estado del lote actualizado correctamente."
      errorMessage="No se pudo actualizar el lote."
      confirmDisabled={lotTarget?.estado === 'BLOQUEADO' && lotTarget?.fecha_vencimiento < fechaHoy()}
      onClose={closeConfirmation}
      onConfirm={() => confirmarOperacion(api.revisarLote, {
        id_lote: lotTarget?.id_lote,
        estado: lotTarget?.estado === 'ACTIVO' ? 'BLOQUEADO' : 'ACTIVO',
      })}
      onToast={toastConfirmation}
      loading={saving}
    />

    <CrudModal modalClassName="med-modal" closeOnBackdrop={false} open={modal === 'out'} wide saving={saving} loading={detailLoading}
      title={`Egresar stock · ${selected?.nombre_comercial || ''}`}
      onClose={close} onSubmit={e => run(e, api.salida, { ...out, ...(loteSalida ? { id_lote: loteSalida } : { id_medicamento: selected?.id_medicamento }) })}
      submitDisabled={!cantidadValida || !stockSuficiente}>
      <MedicamentosTabs disabled={saving} tabs={[{ label: 'Datos del egreso', icon: faArrowUp }, { label: 'Lotes asignados', icon: faBoxOpen }]}>
        <div>      <MedSection icon={faArrowUp}>Datos del egreso</MedSection>
      <Campos>
        <Campo label="Medicamento" wide value={`${selected?.nombre_comercial || ''} · ${selected?.dosis || ''}`} disabled />
        {loteSalida ? <Campo label="Lote de baja" wide value={lotesParaSalida.length ? (lotesParaSalida[0].numero_lote || `#${loteSalida}`) : `#${loteSalida}`} disabled /> : null}
        <Campo label="Motivo del egreso" required options={(loteSalida ? ['BAJA_VENCIMIENTO'] : OUT_TYPES).filter(x => num(selected?.activo) === 1 || !['ENTREGA_DONACION','SALIDA_VENTA'].includes(x)).map(x => op(x, MED_TIPOS[x]))}
          value={out.tipo} onChange={v => updateOut('tipo', v)} />
        <Campo label="Cantidad" type="number" required min="1" step="1" value={out.cantidad} onChange={v => updateOut('cantidad', v)} />
        {out.tipo === 'SALIDA_VENTA' ? <>
          <Campo label="Importe total de venta ($)" required type="number" min="0.01" step="0.01" value={out.importe} onChange={v => updateOut('importe', v)} />
          <Campo label="Medio de pago" required options={[op('', 'Seleccionar medio'), ...medios.map(m => op(m.id_medio_pago, m.nombre))]} value={out.id_medio_pago} onChange={v => updateOut('id_medio_pago', v)} />
        </> : null}
        <Campo label="Detalle / motivo" wide textarea value={out.detalle} onChange={v => updateOut('detalle', v)} />
      </Campos>
</div><div>      {num(selected?.stock_utilizable) === 0 ? <p className="med-inline-note">No hay stock habilitado para entregar o vender. Podés registrar una baja o descarte de las existencias no disponibles.</p> : null}
      {stockSuficiente ? <div className="med-inline-note">
        <strong>Asignación automática por vencimiento ({planEgreso.distribucion.length} {planEgreso.distribucion.length === 1 ? 'lote' : 'lotes'}):</strong>
        {planEgreso.distribucion.map(({ lote, unidades }) => <div key={lote.id_lote}>Lote {lote.numero_lote || `#${lote.id_lote}`} · vence {fecha(lote.fecha_vencimiento)} · {unidades} unidades</div>)}
      </div> : <p className="med-inline-danger">No hay stock suficiente para esta cantidad y tipo de egreso. Disponibles en lotes habilitados: {planEgreso.disponibles}. Consultá Lotes y vencimientos.</p>}</div>
      </MedicamentosTabs>
    </CrudModal>

    {feedback ? <ModuleFeedback {...feedback} onClose={() => setFeedback(null)} /> : null}
  </>;
}
