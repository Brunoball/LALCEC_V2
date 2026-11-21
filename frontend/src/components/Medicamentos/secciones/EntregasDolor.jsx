import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ModulePage } from '../../Global/ModulePage';
import GlobalDivTable from '../../Global/GlobalDivTable';
import GlobalPagination from '../../Global/GlobalPagination';
import CrudModal from '../../Global/Modales/CrudModal';
import ModuleFeedback from '../../Global/ModuleFeedback';
import { canWrite } from '../../_shared/auth/session';
import { medicamentosApi as api } from '../api/medicamentosApi';
import { useMedicamentos } from '../hooks/useMedicamentos';
import { Campos, Campo, op } from '../modales/CamposMedicamentos';
import { fecha, num, vigenteParaEntrega, unidadStockPlural } from '../utils/medicamentosUtils';
import { PRESENTACIONES_SECTOR } from '../utils/medicamentosSelectores';
import '../Medicamentos.css';

const nuevo = () => ({ id_medicamento: '', cantidad: '', receptor: '', detalle: '' });

/** Entregas definitivas: nunca crean préstamos, señas ni asientos de venta. */
export default function EntregasDolor() {
  const [query, setQuery] = useState('');
  const [queryAplicada, setQueryAplicada] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setQueryAplicada(query); }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);
  const loader = useCallback(() => api.entregas({ pagina: page, buscar: queryAplicada }), [page, queryAplicada]);
  const { registros, loading, error, cargar, total, pagina, por_pagina } = useMedicamentos(loader);
  const [modal, setModal] = useState(false);
  const [medicamentos, setMedicamentos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [form, setForm] = useState(nuevo);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const solicitud = useRef(0);
  const guardando = useRef(false);
  const write = canWrite();
  const disponibles = medicamentos.filter(m => Number(m.activo) === 1 && Number(m.stock_actual) > 0 &&
    vigenteParaEntrega(m.fecha_vencimiento) && PRESENTACIONES_SECTOR.DOLOR.includes(m.presentacion));
  const seleccionado = disponibles.find(m => String(m.id_medicamento) === form.id_medicamento);
  const cambiar = (campo, valor) => setForm(actual => ({ ...actual, [campo]: valor }));

  const abrir = async () => {
    const token = ++solicitud.current;
    setForm(nuevo()); setMedicamentos([]); setCargando(true); setModal(true);
    try {
      const datos = await api.catalogo();
      if (token === solicitud.current) setMedicamentos(datos.registros || []);
    } catch (e) {
      if (token === solicitud.current) setFeedback({ type:'error', message:e.message || 'No se pudo consultar el stock.' });
    } finally { if (token === solicitud.current) setCargando(false); }
  };
  const cerrar = () => {
    if (guardando.current) return;
    ++solicitud.current;
    setModal(false);
  };
  const registrar = async event => {
    event.preventDefault();
    if (guardando.current || !seleccionado) return;
    guardando.current = true; setSaving(true);
    try {
      await api.salida({ id_medicamento: Number(form.id_medicamento), tipo: 'ENTREGA_DONACION',
        sector_destino: 'DOLOR', cantidad: Number(form.cantidad), receptor: form.receptor.trim(), detalle: form.detalle.trim() });
      ++solicitud.current; setModal(false);
      setFeedback({ type: 'success', message: 'Entrega sin cargo registrada y stock actualizado.' });
      await cargar({ silencioso: true });
    } catch (e) {
      setFeedback({ type:'error', message:e.message || 'No se pudo registrar la entrega.' });
    } finally { guardando.current = false; setSaving(false); }
  };
  const cantidad = Number(form.cantidad);
  const cantidadValida = Number.isSafeInteger(cantidad) && cantidad > 0 && cantidad <= Number(seleccionado?.stock_actual || 0);

  return <>
    <ModulePage title="Tratamiento del dolor · Entregas"
      description="Entregas sin cargo registradas directamente contra el stock de Tratamiento del dolor. No son préstamos."
      filters={[{ type: 'search', label: 'Búsqueda', value: query, onChange: setQuery, placeholder: ' ' }]}
      primaryActionLabel="Registrar entrega" onPrimaryAction={abrir} canCreate={write}>
      {error ? <p className="med-inline-danger" role="alert">{error}</p> : null}
      <GlobalDivTable ariaLabel="Entregas de Tratamiento del dolor" className="med-table"
        gridClassName="med-grid--entregas" loading={loading} empty={!loading && !error && !registros.length}
        skeletonActionColumn={false} columns={['Fecha', 'Medicamento y presentación', 'Receptor', 'Cantidad', 'Observaciones']}>
        {registros.map(entrega => <div role="row" key={entrega.id_movimiento}
          className="mov-gridTable mov-gridTable--row global-divTable__row med-grid--entregas">
          <div role="cell" className="mov-gridCell">{fecha(entrega.fecha_movimiento)}</div>
          <div role="cell" className="mov-gridCell entity-main-cell"><strong>{entrega.nombre_comercial}</strong>
            <span className="med-cell-secondary">{entrega.presentacion}</span></div>
          <div role="cell" className="mov-gridCell">{entrega.receptor || 'No informado (histórico)'}</div>
          <div role="cell" className="mov-gridCell">{entrega.cantidad} {unidadStockPlural(entrega.unidad_stock, entrega.cantidad)}</div>
          <div role="cell" className="mov-gridCell">{entrega.detalle || '—'}</div>
        </div>)}
      </GlobalDivTable>
      {!loading && !error && !registros.length ? <p className="med-empty">Todavía no hay entregas registradas para este sector.</p> : null}
      <GlobalPagination page={pagina} total={total} perPage={por_pagina} onPageChange={setPage} loading={loading} label="entregas" />
    </ModulePage>
    <CrudModal open={modal} title="Registrar entrega · Tratamiento del dolor" submitLabel="Confirmar entrega"
      modalClassName="med-modal" saving={saving} loading={cargando} closeOnBackdrop={false}
      submitDisabled={!seleccionado || !cantidadValida || form.receptor.trim().length < 3}
      onSubmit={registrar} onClose={cerrar}>
      <p className="med-inline-note">La entrega es gratuita, descuenta stock y no registra préstamo, seña ni cobro.</p>
      <Campos>
        <Campo label="Tratamiento a entregar" required value={form.id_medicamento}
          options={[op('', 'Seleccionar tratamiento'), ...disponibles.map(m => op(m.id_medicamento,
            `${m.nombre_comercial} · ${m.presentacion} (${m.stock_actual} ${unidadStockPlural(m.unidad_stock, m.stock_actual)})`))]}
          onChange={v => setForm(actual => ({ ...actual, id_medicamento: v, cantidad: '' }))} />
        <Campo label="Nombre y apellido de quien recibe" required maxLength={160}
          value={form.receptor} onChange={v => cambiar('receptor', v)} />
        <Campo label="Cantidad" required quantity type="number" min="1" step="1"
          max={seleccionado ? String(seleccionado.stock_actual) : undefined}
          value={form.cantidad} onChange={v => cambiar('cantidad', v)} />
        <Campo label="Observaciones (opcional)" textarea wide maxLength={500}
          value={form.detalle} onChange={v => cambiar('detalle', v)} />
      </Campos>
      {!cargando && !disponibles.length ? <p className="med-inline-danger" role="alert">No hay tratamientos activos con stock y vencimiento vigente. Revisá Tratamiento del dolor → Stock.</p> : null}
      {seleccionado && Number(form.cantidad) > Number(seleccionado.stock_actual) ?
        <p className="med-inline-danger">La cantidad supera el stock disponible.</p> : null}
    </CrudModal>
    {feedback ? <ModuleFeedback {...feedback} onClose={() => setFeedback(null)} /> : null}
  </>;
}
