import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBoxOpen, faClockRotateLeft, faArrowDown, faArrowUp,
  faPen, faBan, faRotateLeft,
} from '@fortawesome/free-solid-svg-icons';
import { ModulePage } from '../../Global/ModulePage';
import GlobalDivTable from '../../Global/GlobalDivTable';
import CrudModal from '../../Global/Modales/CrudModal';
import ModuleFeedback from '../../Global/ModuleFeedback';
import { canWrite } from '../../_shared/auth/session';
import { medicamentosApi as api } from '../api/medicamentosApi';
import { useMedicamentos } from '../hooks/useMedicamentos';
import { Campos, Campo, op } from '../modales/CamposMedicamentos';
import BuscadorEntidad from '../modales/BuscadorEntidad';
import { fecha, fechaHoy, dinero, num, MED_TIPOS } from '../utils/medicamentosUtils';
import { operacionConClave } from '../utils/medicamentosOperacion';
import { distribuirEgreso } from '../utils/medicamentosDistribucion';
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
const situacionLote = lot => lot.fecha_vencimiento < fechaHoy()
  ? (lot.estado === 'BLOQUEADO' ? 'BLOQUEADO Y VENCIDO' : lot.estado === 'DESCARTADO' ? 'DESCARTADO' : 'VENCIDO')
  : (statusName[lot.estado] || lot.estado);

// Se egresa desde el medicamento; para entregar o vender solo se usan lotes
// vigentes, mientras que los descartes pueden descontarse de lotes bloqueados o vencidos.

function Pagina({ page, setPage, total, perPage = 20 }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  return <div className="med-bottom">
    <span>{total} registros · Página {Math.min(page, pages)} de {pages}</span>
    <div>
      <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button>{' '}
      <button type="button" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Siguiente</button>
    </div>
  </div>;
}

async function buscarProcedencias(buscar) {
  const response = await api.procedencias(buscar);
  return response.registros || [];
}

function StockEntryFields({ entry, setEntry, medios, isFirst = false }) {
  const update = (key, value) => setEntry(v => ({ ...v, [key]: value }));
  const paymentOptions = [op('', 'Seleccionar medio'), ...medios.map(m => op(m.id_medio_pago, m.nombre))];
  return <>
    {isFirst ? <div className="med-form-heading">Primer ingreso al stock</div> : null}
    <Campos>
      <Campo label="Origen" required options={[op('DONACION', 'Donación'), op('COMPRA', 'Compra'), ...(isFirst ? [op('INICIAL', 'Stock inicial')] : [])]} value={entry.origen} onChange={v => update('origen', v)} />
      <Campo label="Cantidad" type="number" required min="1" step="1" value={entry.cantidad} onChange={v => update('cantidad', v)} />
      <Campo label="Fecha de ingreso" type="date" required value={entry.fecha_ingreso} onChange={v => update('fecha_ingreso', v)} />
      <Campo label="Fecha de vencimiento" type="date" required min={entry.fecha_ingreso || fechaHoy()} value={entry.fecha_vencimiento} onChange={v => update('fecha_vencimiento', v)} />
      <Campo label="Número de lote (opcional)" value={entry.numero_lote} onChange={v => update('numero_lote', v)} />
      <BuscadorEntidad label="Donante / proveedor (opcional)" manual
        placeholder="Buscar proveedor, socio o escribir nombre externo..."
        value={entry.procedencia} selectedLabel={entry.procedencia}
        buscar={buscarProcedencias} onSelect={item => update('procedencia', item?.nombre || '')} />
      {entry.origen === 'COMPRA' ? <>
        <Campo label="Costo por unidad ($)" type="number" required min="0.01" step="0.01" value={entry.costo_unitario} onChange={v => update('costo_unitario', v)} />
        <Campo label="Medio de pago de la compra" required options={paymentOptions} value={entry.id_medio_pago} onChange={v => update('id_medio_pago', v)} />
        <p className="med-inline-note">La compra registrará un egreso de {dinero(num(entry.cantidad) * num(entry.costo_unitario))} en Contabilidad.</p>
      </> : null}
      <Campo label="Observaciones del ingreso" wide textarea value={entry.observaciones} onChange={v => update('observaciones', v)} />
    </Campos>
  </>;
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
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState('');
  const [selected, setSelected] = useState(null);
  const [med, setMed] = useState(newMedicine);
  const [entry, setEntry] = useState(newEntry);
  const [out, setOut] = useState(newOut);
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
  const pendienteOperacion = useRef(null);
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
  const openLots = (medicine) => {
    setSelected(medicine);
    setLots([]);
    setModal('lotes');
    loadLots(medicine);
  };
  const openOut = async (medicine) => {
    const request = ++viewRequest.current;
    setSelected(medicine);
    setLots([]);
    setOut(newOut(num(medicine.activo) === 1 && num(medicine.stock_utilizable) > 0 ? 'ENTREGA_DONACION' : num(medicine.stock_vencido) > 0 ? 'BAJA_VENCIMIENTO' : 'BAJA_DESCARTE'));
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
    setModal('anular');
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
      await handler(operacionConClave(pendienteOperacion, payload));
      pendienteOperacion.current = null;
      ++viewRequest.current;
      setModal('');
      setSelected(null);
      notify('success', 'Operación registrada correctamente.');
      await cargar();
    } catch (e) { notify('error', e.message || 'No se pudo guardar.'); }
    finally { guardandoRef.current = false; setSaving(false); }
  };
  const openStatus = (medicine) => {
    ++viewRequest.current;
    setSelected(medicine);
    setModal('estado');
  };
  const openLotStatus = (lot) => {
    ++viewRequest.current;
    setLotTarget(lot);
    setModal('lote_estado');
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
  const planEgreso = distribuirEgreso(lots, out.tipo, cantidadValida ? num(out.cantidad) : 0, fechaHoy());
  const stockSuficiente = cantidadValida && planEgreso.suficiente;
  const close = () => { if (!saving) { ++viewRequest.current; pendienteOperacion.current = null; setModal(''); setSelected(null); } };
  const updateMed = (key, value) => setMed(m => ({ ...m, [key]: value }));
  const updateOut = (key, value) => setOut(o => ({ ...o, [key]: value }));

  return <>
    <ModulePage title="Medicamentos · Stock" tabsInTitle
      filters={[
        { type: 'tabs', label: 'Estado del stock', value: section, onChange: v => { setSection(v); setPage(1); }, options: [
          { value: 'ACTIVOS', label: 'Activos', count: activos.length },
          { value: 'BAJAS', label: 'Bajas', count: bajas.length },
        ] },
        { type: 'search', label: 'Buscar', value: query, onChange: v => { setQuery(v); setPage(1); }, placeholder: 'Medicamento, droga, laboratorio...' },
      ]}
      primaryActionLabel="Nuevo medicamento" onPrimaryAction={() => openMed()}
      canCreate={write}>
      {error ? <div className="med-inline-danger">{error}</div> : null}
      <GlobalDivTable ariaLabel="Stock de medicamentos" loading={loading}
        className="med-table" gridClassName="med-grid--stock"
        columns={['Medicamento / droga', 'Laboratorio', 'Presentación / dosis', 'Disponible', 'Últ. ingreso / origen', 'Próx. venc.', 'Acciones']}>
        {shown.map(m => <div key={m.id_medicamento} className="mov-gridTable mov-gridTable--row global-divTable__row" role="row">
          <div role="cell" className="mov-gridCell" title={m.droga}>
            <strong>{m.nombre_comercial}</strong>
            <span className="med-cell-secondary">{m.droga}</span>
            {estadoVisible(m) ? <span className={`med-cell-secondary med-situacion${num(m.activo) === 1 ? '' : ' med-situacion--baja'}`}>{estadoVisible(m)}</span> : null}
          </div>
          <div role="cell" className="mov-gridCell">{m.laboratorio || '—'}</div>
          <div role="cell" className="mov-gridCell">{m.presentacion} · {m.dosis}</div>
          <div role="cell" className="mov-gridCell">
            <strong>{m.stock_utilizable} {m.unidad_stock} disponibles</strong>
            {num(m.stock_total) > num(m.stock_utilizable) ? <span className="med-cell-secondary">{m.stock_total} en existencia · {num(m.stock_total) - num(m.stock_utilizable)} no disponibles</span> : null}
            {num(m.stock_cuarentena) > 0 ? <span className="med-cell-secondary">{m.stock_cuarentena} de devoluciones anteriores sin incorporar</span> : null}
          </div>
          <div role="cell" className="mov-gridCell">{fecha(m.ultimo_ingreso)}<span className="med-cell-secondary">{originName[m.ultimo_origen] || '—'}</span></div>
          <div role="cell" className="mov-gridCell">{fecha(m.proximo_vencimiento)}</div>
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
        {!loading && !filtered.length ? <p className="med-empty">{section === 'ACTIVOS' ? 'No hay medicamentos activos que coincidan.' : 'No hay medicamentos dados de baja que coincidan.'}</p> : null}
      </GlobalDivTable>
      <Pagina page={page} setPage={setPage} total={filtered.length} />
    </ModulePage>

    <CrudModal open={modal === 'med'} wide saving={saving}
      title={med.id_medicamento ? 'Editar medicamento' : 'Nuevo medicamento'}
      subtitle={med.id_medicamento ? 'Los ingresos anteriores y sus vencimientos se consultan en Lotes y vencimientos.' : 'Completá el medicamento y su primera cantidad en un solo formulario.'}
      onClose={close}
      onSubmit={e => run(e, api.guardar, med.id_medicamento ? med : { ...med, ingreso_inicial: entry })}>
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
      {!med.id_medicamento ? <StockEntryFields entry={entry} setEntry={setEntry} medios={medios} isFirst /> :
        <p className="med-inline-note">La cantidad, origen, ingreso, lote y vencimiento pertenecen a cada ingreso registrado. Para sumar unidades, usá el botón Ingresar stock del medicamento; para ver sus datos, el botón Lotes y vencimientos.</p>}
    </CrudModal>

    <CrudModal open={modal === 'entry'} wide saving={saving}
      title={`Ingresar stock · ${selected?.nombre_comercial || ''}`}
      subtitle="Cada nuevo ingreso conserva su fecha, origen y vencimiento."
      onClose={close} onSubmit={e => run(e, api.ingresar, entry)}>
      <StockEntryFields entry={entry} setEntry={setEntry} medios={medios} />
    </CrudModal>

    <CrudModal open={modal === 'lotes'} wide hideSubmit
      loading={detailLoading} title={`Lotes y vencimientos · ${selected?.nombre_comercial || ''}`}
      subtitle={`${selected?.droga || ''} · ${selected?.presentacion || ''} · ${selected?.dosis || ''}`}
      onClose={close}>
      {lots.length ? <div className="med-lot-list">{lots.map(l => <section className="med-box med-lot-card" key={l.id_lote}>
        <div className="med-lot-heading"><strong>Lote {l.numero_lote || `#${l.id_lote}`}</strong><span className="med-lot-status">{situacionLote(l)}</span></div>
        <div className="med-lot-data">
          <div><small>Fecha de ingreso</small><strong>{fecha(l.fecha_ingreso)}</strong></div>
          <div><small>Vencimiento</small><strong>{fecha(l.fecha_vencimiento)}</strong></div>
          <div><small>Origen</small><strong>{originName[l.origen] || l.origen}</strong></div>
          <div><small>Disponible</small><strong>{l.cantidad_disponible} {l.unidad_stock}</strong></div>
          {num(l.cantidad_cuarentena) > 0 ? <div><small>Devoluciones anteriores sin incorporar</small><strong>{l.cantidad_cuarentena}</strong></div> : null}
          <div><small>Donante / proveedor</small><strong>{l.procedencia || '—'}</strong></div>
          {l.origen === 'COMPRA' ? <div><small>Costo unitario</small><strong>{dinero(l.costo_unitario)}</strong></div> : null}
        </div>
        {l.observaciones ? <p className="med-lot-notes">{l.observaciones}</p> : null}
        {write && l.estado !== 'DESCARTADO' ? <div className="med-actions">
          <ActionButton icon={l.estado === 'ACTIVO' ? faBan : faRotateLeft}
            label={l.estado === 'ACTIVO' ? 'Bloquear lote' : 'Desbloquear lote'}
            onClick={() => openLotStatus(l)}
            disabled={saving || (l.estado === 'BLOQUEADO' && l.fecha_vencimiento < fechaHoy())} />
          {l.estado === 'BLOQUEADO' && l.fecha_vencimiento < fechaHoy() ? <span className="med-cell-secondary">Vencido: no se puede desbloquear.</span> : null}
        </div> : null}
      </section>)}</div> : <p className="med-empty">Este medicamento todavía no tiene lotes.</p>}
    </CrudModal>

    <CrudModal open={modal === 'history'} wide hideSubmit
      loading={detailLoading} title={`Historial · ${selected?.nombre_comercial || ''}`}
      subtitle="Movimientos registrados únicamente para este medicamento."
      onClose={close}>
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
      </div>)}</div> : <p className="med-empty">No hay movimientos registrados.</p>}
      <Pagina page={historyPage} setPage={p => fetchHistory(selected, typeof p === 'function' ? p(historyPage) : p)} total={historyTotal} perPage={50} />
    </CrudModal>

    <CrudModal open={modal === 'anular'} saving={saving} danger
      title={anular?.tipo === 'INGRESO_COMPRA' ? 'Anular compra de medicamentos' : 'Anular venta de medicamentos'}
      subtitle={`Movimiento #${anular?.id_movimiento || ''} · Se conservará todo el historial`}
      submitLabel="Registrar anulación y contramovimientos"
      submitDisabled={!reintegroMedio || motivoAnulacion.trim().length < 10 || !confirmarDevolucion}
      onClose={close}
      onSubmit={e => run(e, api.anular, {
        id_movimiento: anular?.id_movimiento,
        motivo: motivoAnulacion.trim(),
        id_medio_pago: reintegroMedio,
        devolucion_confirmada: confirmarDevolucion,
      })}>
      <p className="med-inline-danger">Esta acción registra el stock inverso y el reintegro completo de dinero en Contabilidad. No borra ni modifica los asientos originales. Debés haber recibido o devuelto físicamente el medicamento y haber realizado el reintegro económico. Si anulás una venta, lo devuelto ingresa en lotes nuevos bloqueados hasta su revisión. Si el lote comprado ya fue utilizado, el backend rechazará la anulación.</p>
      <Campos>
        <Campo label="Medio de pago utilizado para el reintegro" required options={[op('', 'Seleccionar medio'), ...medios.map(m => op(m.id_medio_pago, m.nombre))]} value={reintegroMedio} onChange={setReintegroMedio} />
        <Campo label="Motivo documentado de anulación (mínimo 10 caracteres)" wide required textarea value={motivoAnulacion} onChange={setMotivoAnulacion} />
      </Campos>
      <label className="med-anular-confirmacion"><input type="checkbox" checked={confirmarDevolucion} onChange={e => setConfirmarDevolucion(e.target.checked)} /> Confirmo que se efectuó la devolución física de todas las unidades y el reintegro de dinero por el total original.</label>
    </CrudModal>

    <CrudModal open={modal === 'estado'} saving={saving}
      title={num(selected?.activo) === 1 ? 'Dar de baja medicamento' : 'Reactivar medicamento'}
      subtitle={selected?.nombre_comercial || ''}
      danger={num(selected?.activo) === 1}
      submitLabel={num(selected?.activo) === 1 ? 'Dar de baja' : 'Reactivar'}
      onClose={close}
      onSubmit={e => run(e, api.cambiarEstado, {
        id_medicamento: selected?.id_medicamento,
        activo: num(selected?.activo) === 1 ? 0 : 1,
      })}>
      <p className="med-inline-note">
        {num(selected?.activo) === 1
          ? '¿Confirmás la baja de este medicamento? No podrá utilizarse para nuevos ingresos, ventas ni préstamos mientras esté inactivo. Sus lotes y movimientos históricos se conservan.'
          : '¿Confirmás la reactivación de este medicamento? Sus lotes conservarán sus estados y fechas de vencimiento.'}
      </p>
    </CrudModal>

    <CrudModal open={modal === 'lote_estado'} saving={saving}
      title={lotTarget?.estado === 'ACTIVO' ? 'Bloquear lote' : 'Desbloquear lote'}
      subtitle={`${selected?.nombre_comercial || ''} · Lote ${lotTarget?.numero_lote || `#${lotTarget?.id_lote || ''}`}`}
      submitLabel={lotTarget?.estado === 'ACTIVO' ? 'Bloquear lote' : 'Desbloquear lote'}
      danger={lotTarget?.estado === 'ACTIVO'} onClose={close}
      onSubmit={e => run(e, api.revisarLote, {
        id_lote: lotTarget?.id_lote,
        estado: lotTarget?.estado === 'ACTIVO' ? 'BLOQUEADO' : 'ACTIVO',
      })}>
      <p className="med-inline-note">{lotTarget?.estado === 'ACTIVO'
        ? 'Este lote dejará de estar disponible para entregas, ventas o préstamos. Podés desbloquearlo más adelante si no está vencido.'
        : num(selected?.activo) === 1 ? 'El lote volverá a estar disponible para entregas, ventas y préstamos si todavía está vigente.' : 'El lote quedará desbloqueado, pero el medicamento seguirá dado de baja hasta que lo reactives.'}</p>
    </CrudModal>

    <CrudModal open={modal === 'out'} wide saving={saving} loading={detailLoading}
      title={`Egresar stock · ${selected?.nombre_comercial || ''}`}
      onClose={close} onSubmit={e => run(e, api.salida, { ...out, id_medicamento: selected?.id_medicamento })}
      submitDisabled={!cantidadValida || !stockSuficiente}>
      <Campos>
        <Campo label="Medicamento" wide value={`${selected?.nombre_comercial || ''} · ${selected?.dosis || ''}`} disabled />
        <Campo label="Motivo del egreso" required options={OUT_TYPES.filter(x => num(selected?.activo) === 1 || !['ENTREGA_DONACION','SALIDA_VENTA'].includes(x)).map(x => op(x, MED_TIPOS[x]))}
          value={out.tipo} onChange={v => updateOut('tipo', v)} />
        <Campo label="Cantidad" type="number" required min="1" step="1" value={out.cantidad} onChange={v => updateOut('cantidad', v)} />
        {out.tipo === 'SALIDA_VENTA' ? <>
          <Campo label="Importe total de venta ($)" required type="number" min="0.01" step="0.01" value={out.importe} onChange={v => updateOut('importe', v)} />
          <Campo label="Medio de pago" required options={[op('', 'Seleccionar medio'), ...medios.map(m => op(m.id_medio_pago, m.nombre))]} value={out.id_medio_pago} onChange={v => updateOut('id_medio_pago', v)} />
        </> : null}
        <Campo label="Detalle / motivo" wide textarea value={out.detalle} onChange={v => updateOut('detalle', v)} />
      </Campos>
      {num(selected?.stock_utilizable) === 0 ? <p className="med-inline-note">No hay stock habilitado para entregar o vender. Podés registrar una baja o descarte de las existencias no disponibles.</p> : null}
      {stockSuficiente ? <div className="med-inline-note">
        <strong>Asignación automática por vencimiento ({planEgreso.distribucion.length} {planEgreso.distribucion.length === 1 ? 'lote' : 'lotes'}):</strong>
        {planEgreso.distribucion.map(({ lote, unidades }) => <div key={lote.id_lote}>Lote {lote.numero_lote || `#${lote.id_lote}`} · vence {fecha(lote.fecha_vencimiento)} · {unidades} unidades</div>)}
      </div> : <p className="med-inline-danger">No hay stock suficiente para esta cantidad y tipo de egreso. Disponibles en lotes habilitados: {planEgreso.disponibles}. Consultá Lotes y vencimientos.</p>}
    </CrudModal>

    {feedback ? <ModuleFeedback {...feedback} onClose={() => setFeedback(null)} /> : null}
  </>;
}
