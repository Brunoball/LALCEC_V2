import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faCapsules, faBoxOpen, faCircleCheck, faHandHoldingMedical, faLink, faPen, faPowerOff, faRotateLeft, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { ModulePage } from '../../Global/ModulePage';
import CrudModal from '../../Global/Modales/CrudModal';
import ModalEliminarGlobal from '../../Global/Modales/ModalEliminarGlobal';
import ModuleFeedback from '../../Global/ModuleFeedback';
import { FloatingField } from '../../Global/Formularios/TabbedForm';
import { canWrite } from '../../_shared/auth/session';
import { medicamentosApi } from '../../Medicamentos/api/medicamentosApi';
import '../configuracion.css';
import './MedicamentosConfiguracion.css';

const LISTAS = {
  PRESENTACION: { nombre: 'Presentaciones', singular: 'presentación', nueva: 'Nueva presentación', icon: faCapsules, max: 100,
    uso: ['medicamento', 'medicamentos'], destino: 'nuevos medicamentos' },
  UNIDAD_STOCK: { nombre: 'Unidades de stock', singular: 'unidad de stock', nueva: 'Nueva unidad de stock', icon: faBoxOpen, max: 40,
    uso: ['medicamento', 'medicamentos'], destino: 'nuevos medicamentos' },
  ORIGEN_INGRESO: { nombre: 'Orígenes de ingreso', singular: 'origen de ingreso', nueva: 'Nuevo origen de ingreso', icon: faHandHoldingMedical, max: 60,
    uso: ['ingreso', 'ingresos'], destino: 'nuevos ingresos de stock' },
};
const MAYUS = v => String(v || '').toLocaleUpperCase('es-AR');

// Mismo formato de indicadores que Catálogos, Contable y Usuarios.
function MedicamentosStat({ icon, label, value, detail, tone }) {
  return (
    <article className={`med-config__stat med-config__stat--${tone}`}>
      <span className="med-config__statIcon" aria-hidden="true"><FontAwesomeIcon icon={icon} /></span>
      <div className="med-config__statContent">
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

export default function MedicamentosConfiguracion() {
  const navigate = useNavigate();
  const editable = canWrite();
  const [tipo, setTipo] = useState('PRESENTACION');
  const [datos, setDatos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [form, setForm] = useState(null);
  const [estado, setEstado] = useState(null);
  const [eliminar, setEliminar] = useState(null);
  const meta = LISTAS[tipo];

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await medicamentosApi.opciones();
      setDatos(r.registros || []);
    } catch (e) { setFeedback({ type: 'error', message: e.message }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  const opcionesTipo = useMemo(() => datos.filter(x => x.tipo === tipo), [datos, tipo]);
  const opciones = useMemo(() => opcionesTipo.filter(x => MAYUS(x.nombre).includes(MAYUS(busqueda))), [opcionesTipo, busqueda]);
  const estadisticas = useMemo(() => {
    const total = opcionesTipo.length;
    const activas = opcionesTipo.filter(x => Number(x.activo) === 1).length;
    const enUso = opcionesTipo.filter(x => Number(x.cantidad_usos || 0) > 0).length;
    const mostrar = valor => loading ? '—' : valor;
    return [
      { icon: meta.icon, label: 'TOTAL', value: mostrar(total), detail: 'Opciones configuradas', tone: 'total' },
      { icon: faCircleCheck, label: 'ACTIVAS', value: mostrar(activas), detail: 'Disponibles para seleccionar', tone: 'active' },
      { icon: faPowerOff, label: 'BAJAS', value: mostrar(total - activas), detail: 'Fuera de nuevas operaciones', tone: 'inactive' },
      { icon: faLink, label: 'EN USO', value: mostrar(enUso), detail: 'Con registros asociados', tone: 'usage' },
    ];
  }, [opcionesTipo, loading, meta.icon]);
  const avisar = (type, message) => setFeedback({ type, message });

  const guardar = async e => {
    e.preventDefault();
    if (!form || saving) return;
    setSaving(true);
    try {
      const r = await medicamentosApi.guardarOpcion({ tipo: form.tipo, id_opcion: form.id_opcion || null, nombre: MAYUS(form.nombre.trim()) });
      setForm(null);
      avisar('success', r.mensaje || 'Opción guardada.');
      await cargar();
    } catch (e) { avisar('error', e.message); }
    finally { setSaving(false); }
  };
  const aplicarEstado = async () => {
    setSaving(true);
    try {
      const r = await medicamentosApi.estadoOpcion(estado.id_opcion, Number(estado.activo) === 1 ? 0 : 1);
      await cargar();
      return r;
    } finally { setSaving(false); }
  };
  const eliminarOpcion = async () => {
    setSaving(true);
    try {
      const r = await medicamentosApi.eliminarOpcion(eliminar.id_opcion);
      await cargar();
      return r;
    } finally { setSaving(false); }
  };
  const toast = (type, message) => avisar(type, message);

  return <>
    <ModulePage
      title="Configuración de medicamentos"
      className="config-sectionPage config-medicamentosPage"
      filters={[{ key: 'med-opciones-search', type: 'search', label: 'Buscar', placeholder: '', value: busqueda, onChange: setBusqueda }]}
      primaryActionLabel={meta.nueva}
      onPrimaryAction={editable ? () => { setFeedback(null); setForm({ tipo, nombre: '', id_opcion: '' }); } : undefined}
      canCreate={editable}
      secondaryActions={[{ key: 'volver', label: 'Volver', icon: faArrowLeft, onClick: () => navigate('/configuracion') }]}
      notice={!editable ? 'Tu usuario solo tiene permiso de consulta.' : null}>
      <ModuleFeedback type={feedback?.type || 'error'} message={feedback?.message || ''} onClose={() => setFeedback(null)} />
      <section className="med-config__stats" aria-label={`Resumen de ${meta.nombre.toLowerCase()}`}>
        {estadisticas.map(stat => <MedicamentosStat key={stat.label} {...stat} />)}
      </section>
      <section className="config-detailPanel config-detailPanel--list med-config">
        <div className="med-config__toolbar">
          <div className="med-config__tabs" role="tablist" aria-label="Selectores de medicamentos">
            {Object.entries(LISTAS).map(([clave, lista]) => <button key={clave} type="button" role="tab" aria-selected={tipo === clave} className={tipo === clave ? 'is-active' : ''}
              onClick={() => { setTipo(clave); setBusqueda(''); setFeedback(null); }}>
              <FontAwesomeIcon icon={lista.icon} /><span>{lista.nombre}</span>
            </button>)}
          </div>
        </div>
        <div className="med-config__table" role="region" aria-label={`Listado de ${meta.nombre.toLowerCase()}`} tabIndex={0}>
          <div className="med-config__head"><span>Nombre</span><span>Estado</span><span>Uso</span><span>Acciones</span></div>
          <div className="med-config__body">
            {loading ? <div className="med-config__empty">Cargando opciones...</div> : opciones.length === 0 ? <div className="med-config__empty">No hay opciones para mostrar.</div> : opciones.map(item => <article key={item.id_opcion} className={`med-config__row ${Number(item.activo) === 1 ? '' : 'is-inactive'}`}>
              <div className="med-config__identity"><span className="med-config__identityIcon"><FontAwesomeIcon icon={meta.icon} /></span><div><strong>{item.nombre}</strong><small>{item.codigo_sistema ? `${meta.singular} · del sistema` : meta.singular}</small></div></div>
              <span className={`med-config__status ${Number(item.activo) === 1 ? 'is-active' : 'is-inactive'}`}>{Number(item.activo) === 1 ? 'Disponible' : 'Baja'}</span>
              <span className="med-config__usage"><strong>{item.cantidad_usos}</strong> {Number(item.cantidad_usos) === 1 ? meta.uso[0] : meta.uso[1]}</span>
              <div className="med-config__actions mov-actionsInline">
                {editable ? <>
                  <button type="button" className="mov-iconBtn" aria-label={`Editar ${item.nombre}`} title="Editar" onClick={() => setForm({ id_opcion: item.id_opcion, nombre: item.nombre, tipo: item.tipo, codigo_sistema: item.codigo_sistema || null })}><FontAwesomeIcon icon={faPen} /></button>
                  <button type="button" className={`mov-iconBtn ${Number(item.activo) === 1 ? 'mov-iconBtn--danger' : ''}`} aria-label={`${Number(item.activo) === 1 ? 'Dar de baja' : 'Reactivar'} ${item.nombre}`} title={Number(item.activo) === 1 ? 'Dar de baja' : 'Reactivar'} onClick={() => setEstado(item)}><FontAwesomeIcon icon={Number(item.activo) === 1 ? faPowerOff : faRotateLeft} /></button>
                  <button type="button" className="mov-iconBtn mov-iconBtn--danger" aria-label={`Eliminar ${item.nombre}`} title={item.codigo_sistema ? 'Origen del sistema: se puede renombrar o dar de baja, no eliminar' : Number(item.cantidad_usos) ? 'En uso: solo se puede dar de baja' : 'Eliminar'} disabled={Boolean(item.codigo_sistema) || Number(item.cantidad_usos) > 0} onClick={() => setEliminar(item)}><FontAwesomeIcon icon={faTrashCan} /></button>
                </> : '—'}
              </div>
            </article>)}
          </div>
        </div>
      </section>
    </ModulePage>
    <CrudModal modalClassName="med-config__modal" open={Boolean(form)} title={form?.id_opcion ? `Editar ${meta.singular}` : meta.nueva}
      onClose={() => { if (!saving) setForm(null); }} onSubmit={guardar} saving={saving} closeOnBackdrop={false} submitLabel="Guardar">
      <div className="entity-form"><div className="entity-form__grid entity-form__grid--single">
        <FloatingField label="Nombre *" active={Boolean(form?.nombre)}>
          <input required autoFocus maxLength={LISTAS[form?.tipo]?.max || 40} placeholder=" " value={form?.nombre || ''}
            onChange={e => setForm(f => ({ ...f, nombre: MAYUS(e.target.value) }))} />
        </FloatingField>
      </div></div>
      {Boolean(form?.id_opcion) ? <p className="med-config__help">{form?.codigo_sistema
        ? 'Es un origen del sistema: el nuevo nombre se mostrará en los selectores y en el historial, sin cambiar su comportamiento.'
        : 'Si una opción ya está utilizada, conservala como dato histórico: podés darla de baja y crear otra con el nuevo nombre.'}</p> : null}
    </CrudModal>
    <ModalEliminarGlobal open={Boolean(estado)} row={estado} operacion={Number(estado?.activo) === 1 ? 'baja' : 'alta'}
      title={Number(estado?.activo) === 1 ? 'Dar de baja opción' : 'Reactivar opción'} message={Number(estado?.activo) === 1 ? `Dejará de estar disponible para ${meta.destino}. Los registros existentes no se modifican.` : 'La opción volverá a aparecer en los selectores.'}
      details={estado ? [{ label: 'Opción', value: estado.nombre }] : []} loading={saving} onClose={() => setEstado(null)} onConfirm={aplicarEstado} onToast={toast} />
    <ModalEliminarGlobal open={Boolean(eliminar)} row={eliminar} operacion="eliminar" title="Eliminar opción"
      message="Esta opción no está utilizada en ningún registro. Se eliminará definitivamente." loading={saving}
      details={eliminar ? [{ label: 'Opción', value: eliminar.nombre }] : []} onClose={() => setEliminar(null)} onConfirm={eliminarOpcion} onToast={toast} />
  </>;
}
