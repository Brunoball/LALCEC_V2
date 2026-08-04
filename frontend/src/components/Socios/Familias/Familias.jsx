import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAddressBook,
  faHouse,
  faPen,
  faRotateLeft,
  faToggleOff,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../../Global/components/ModulePage";
import GlobalDivTable from "../../Global/components/GlobalDivTable";
import CrudModal from "../../Global/components/CrudModal";
import ModalEliminarGlobal from "../../Global/components/ModalEliminarGlobal";
import ModuleFeedback from "../../Global/components/ModuleFeedback";
import {
  EntityFormPanel,
  EntityTabs,
  FloatingField,
} from "../../Global/components/TabbedForm";
import { canWrite } from "../../Global/auth/session";
import { familiasApi } from "../api/sociosApi";
import { useFamilias } from "../hooks/useFamilias";
import "./Familias.css";
import "./FamiliasModal.css";

const upper = (value) => value.toLocaleUpperCase("es-AR");
const FORM_TAB_DETAILS = "details";
const FORM_TAB_MEMBERS = "members";
const emptyForm = () => ({
  id_familia: "",
  nombre: "",
  descripcion: "",
  integrante_ids: [],
});

function FamilyForm({ form, setForm, partners, activeTab, onTabChange }) {
  const [memberSearch, setMemberSearch] = useState("");
  const visible = partners.filter(
    (partner) =>
      (partner.activo !== false ||
        form.integrante_ids.includes(partner.id_socio)) &&
      `${partner.apellido} ${partner.nombre} ${partner.dni}`
        .toLowerCase()
        .includes(memberSearch.toLowerCase()),
  );
  const toggle = (id) =>
    setForm((current) => ({
      ...current,
      integrante_ids: current.integrante_ids.includes(id)
        ? current.integrante_ids.filter((item) => item !== id)
        : [...current.integrante_ids, id],
    }));
  return (
    <div className="entity-form familias-modal__form">
      <EntityTabs
        tabs={[
          {
            value: FORM_TAB_DETAILS,
            label: "Datos de la familia",
            icon: faHouse,
          },
          {
            value: FORM_TAB_MEMBERS,
            label: "Integrantes",
            icon: faUsers,
            badge: form.integrante_ids.length || null,
          },
        ]}
        value={activeTab}
        onChange={onTabChange}
        idPrefix="familia-form-tab"
        ariaLabel="Secciones de la ficha de la familia"
      />

      {activeTab === FORM_TAB_DETAILS ? (
        <EntityFormPanel
          tabValue={FORM_TAB_DETAILS}
          idPrefix="familia-form-tab"
          eyebrow="Ficha principal"
          title="Datos de la familia"
          icon={faAddressBook}
          tag="Nombre obligatorio"
          bodyClassName="familias-form-panel__body--details"
          hint="Definí un nombre claro para identificar al grupo. Después podés seleccionar sus integrantes desde la siguiente pestaña."
        >
          <FloatingField
            label="Nombre de la familia *"
            active={Boolean(form.nombre)}
          >
            <input
              value={form.nombre}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  nombre: upper(e.target.value),
                }))
              }
              maxLength={150}
              placeholder=" "
              autoFocus
            />
          </FloatingField>
          <FloatingField
            label="Descripción"
            active={Boolean(form.descripcion)}
            textarea
          >
            <textarea
              value={form.descripcion}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  descripcion: upper(e.target.value),
                }))
              }
              rows={3}
              maxLength={500}
              placeholder=" "
            />
          </FloatingField>
        </EntityFormPanel>
      ) : (
        <EntityFormPanel
          tabValue={FORM_TAB_MEMBERS}
          idPrefix="familia-form-tab"
          eyebrow="Composición del grupo"
          title="Integrantes de la familia"
          icon={faUsers}
          tag={
            form.integrante_ids.length
              ? `${form.integrante_ids.length} ${form.integrante_ids.length === 1 ? "integrante" : "integrantes"}`
              : "Sin integrantes"
          }
          bodyClassName="familias-form-panel__body--members"
        >
          <div className="familias-modal__search-row">
            <FloatingField
              label="Buscar socio por nombre o DNI"
              active={Boolean(memberSearch)}
              className="familias-modal__member-search"
            >
              <input
                type="search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder=" "
              />
            </FloatingField>
          </div>

          <fieldset className="entity-checks familias-modal__members">
            <legend>
              <FontAwesomeIcon icon={faUsers} /> Socios disponibles
            </legend>
            <div className="familias-modal__member-list">
              {visible.map((partner) => {
                const belongsElsewhere =
                  partner.id_familia &&
                  partner.familia_activa !== false &&
                  partner.id_familia !== Number(form.id_familia || 0);
                const selected = form.integrante_ids.includes(partner.id_socio);
                const inactive = partner.activo === false;
                return (
                  <label
                    key={partner.id_socio}
                    className={`entity-check-option familias-modal__member ${selected ? "is-selected" : ""}`.trim()}
                    title={
                      belongsElsewhere
                        ? `Ya pertenece a ${partner.familia}`
                        : inactive
                          ? "Socio dado de baja"
                          : ""
                    }
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={Boolean(
                        belongsElsewhere || (inactive && !selected),
                      )}
                      onChange={() => toggle(partner.id_socio)}
                    />
                    <span className="familias-modal__member-copy">
                      <strong>
                        {partner.apellido}, {partner.nombre}
                      </strong>
                      <small>
                        DNI {partner.dni}
                        {belongsElsewhere ? ` · ${partner.familia}` : ""}
                        {inactive ? " · SOCIO DADO DE BAJA" : ""}
                      </small>
                    </span>
                  </label>
                );
              })}
              {!visible.length ? (
                <div className="familias-modal__empty">
                  <strong>Sin resultados</strong>
                  <span>No hay socios disponibles con esa búsqueda.</span>
                </div>
              ) : null}
            </div>
          </fieldset>
        </EntityFormPanel>
      )}
    </div>
  );
}

export default function Familias() {
  const writable = canWrite();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("activo");
  const filters = useMemo(
    () => ({ buscar: search, estado: status }),
    [search, status],
  );
  const { items, catalogos, loading, error, cargar } = useFamilias(filters);
  const [form, setForm] = useState(emptyForm());
  const [formTab, setFormTab] = useState(FORM_TAB_DETAILS);
  const [modalOpen, setModalOpen] = useState(false);
  const [stateModal, setStateModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const filtersUi = [
    {
      key: "estado",
      label: "Estado",
      type: "tabs",
      ariaLabel: "Estado de las familias",
      value: status,
      onChange: setStatus,
      options: [
        { value: "activo", label: "Activas" },
        { value: "inactivo", label: "Bajas" },
      ],
    },
    {
      key: "buscar",
      label: "Búsqueda",
      type: "search",
      placeholder: " ",
      value: search,
      onChange: setSearch,
    },
  ];
  const openNew = () => {
    setForm(emptyForm());
    setFormTab(FORM_TAB_DETAILS);
    setModalOpen(true);
  };
  const openEdit = (item) => {
    setForm({
      id_familia: item.id_familia,
      nombre: item.nombre,
      descripcion: item.descripcion || "",
      integrante_ids: item.integrante_ids || [],
    });
    setFormTab(FORM_TAB_DETAILS);
    setModalOpen(true);
  };
  const save = async (event) => {
    event.preventDefault();

    if (!form.nombre.trim()) {
      setFormTab(FORM_TAB_DETAILS);
      setFeedback({
        type: "error",
        message: "Completá el nombre de la familia.",
      });
      return;
    }

    if (!form.integrante_ids.length) {
      setFormTab(FORM_TAB_MEMBERS);
      setFeedback({
        type: "error",
        message: "Seleccioná al menos un integrante para la familia.",
      });
      return;
    }

    setSaving(true);
    try {
      const response = await familiasApi.guardar(form);
      setModalOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };
  const changeState = async () => {
    if (!stateModal) return;
    const response = stateModal.activo
      ? await familiasApi.darBaja(stateModal.id_familia)
      : await familiasApi.reactivar(stateModal.id_familia);
    await cargar();
    return response;
  };
  return (
    <>
      <ModulePage
        title="Familias"
        filters={filtersUi}
        tabsInTitle
        primaryActionLabel="Nueva familia"
        onPrimaryAction={openNew}
        canCreate={writable}
        notice={
          !writable
            ? "Tu usuario tiene permiso de consulta. Las modificaciones están deshabilitadas."
            : null
        }
      >
        <ModuleFeedback
          type={feedback?.type || "error"}
          message={feedback?.message || error}
          duration={feedback?.duration}
          onClose={() => setFeedback(null)}
        />
        <GlobalDivTable
          className="familias-table"
          bodyClassName="entity-table-wrap"
          gridClassName="familias-grid"
          ariaLabel="Listado de familias"
          columns={[
            "Familia",
            "Descripción",
            "Integrantes",
            "Cantidad",
            "Estado",
            "Acciones",
          ]}
        >
          {loading && !items.length ? (
            <div className="module-empty">
              <strong>Cargando familias...</strong>
              <span>Consultando los grupos de la organización.</span>
            </div>
          ) : null}
          {!loading && !error && !items.length ? (
            <div className="module-empty">
              <strong>Sin familias para mostrar</strong>
              <span>Creá la primera familia o cambiá los filtros.</span>
            </div>
          ) : null}
          {items.map((item) => (
            <div
              className="mov-gridTable mov-gridTable--row global-divTable__row entity-table-row familias-grid"
              role="row"
              key={item.id_familia}
            >
              <div className="mov-gridCell is-strong">{item.nombre}</div>
              <div className="mov-gridCell">
                <span className="entity-wrap-text">
                  {item.descripcion || "—"}
                </span>
              </div>
              <div className="mov-gridCell">
                <span className="entity-wrap-text">
                  {(item.integrantes || [])
                    .map(
                      (member) =>
                        `${member.apellido}, ${member.nombre}${member.activo === false ? " (BAJA)" : ""}`,
                    )
                    .join(" · ") || "SIN INTEGRANTES"}
                </span>
              </div>
              <div className="mov-gridCell is-center">
                <span className="mov-chip">{item.cantidad_integrantes}</span>
              </div>
              <div className="mov-gridCell">
                <span
                  className={`mov-chip ${item.activo ? "mov-chip--ok" : "mov-chip--danger"}`}
                >
                  {item.activo ? "ACTIVA" : "BAJA"}
                </span>
              </div>
              <div className="mov-gridCell mov-gridCell--actions">
                {writable ? (
                  <div className="mov-actionsInline">
                    <button
                      className="mov-iconBtn"
                      type="button"
                      title="Editar"
                      onClick={() => openEdit(item)}
                    >
                      <FontAwesomeIcon icon={faPen} />
                    </button>
                    <button
                      className={`mov-iconBtn ${item.activo ? "mov-iconBtn--danger" : ""}`}
                      type="button"
                      title={item.activo ? "Dar de baja" : "Reactivar"}
                      onClick={() => setStateModal(item)}
                    >
                      <FontAwesomeIcon
                        icon={item.activo ? faToggleOff : faRotateLeft}
                      />
                    </button>
                  </div>
                ) : (
                  <span className="entity-readonly">CONSULTA</span>
                )}
              </div>
            </div>
          ))}
        </GlobalDivTable>
      </ModulePage>

      <CrudModal
        open={modalOpen}
        title={form.id_familia ? "Editar familia" : "Nueva familia"}
        subtitle="Definí el grupo y elegí sus integrantes activos."
        onClose={() => setModalOpen(false)}
        onSubmit={save}
        saving={saving}
        submitLabel={form.id_familia ? "Guardar cambios" : "Crear familia"}
        modalClassName="familias-modal familias-modal--form"
        wide
      >
        <FamilyForm
          form={form}
          setForm={setForm}
          partners={catalogos.socios || []}
          activeTab={formTab}
          onTabChange={setFormTab}
        />
      </CrudModal>
      <ModalEliminarGlobal
        open={Boolean(stateModal)}
        operacion={stateModal?.activo ? "baja" : "alta"}
        row={stateModal}
        title={
          stateModal?.activo ? "Dar de baja la familia" : "Reactivar familia"
        }
        message={
          stateModal?.activo
            ? "La familia quedará inactiva. Los pagos históricos no se modificarán."
            : "La familia volverá a estar disponible con los integrantes que no hayan sido reasignados."
        }
        warning={
          stateModal?.activo
            ? "Sus integrantes podrán asignarse a otra familia."
            : ""
        }
        details={
          stateModal
            ? [
                { label: "Familia", value: stateModal.nombre },
                {
                  label: "Integrantes",
                  value: stateModal.cantidad_integrantes,
                },
                {
                  label: "Estado actual",
                  value: stateModal.activo ? "ACTIVA" : "BAJA",
                },
              ]
            : []
        }
        onClose={() => setStateModal(null)}
        onConfirm={changeState}
        onToast={(type, message, duration) =>
          setFeedback({ type, message, duration })
        }
        confirmLabel={stateModal?.activo ? "Dar de baja" : "Reactivar"}
        loadingMessage={
          stateModal?.activo
            ? "Dando de baja la familia…"
            : "Reactivando la familia…"
        }
        successMessage={
          stateModal?.activo
            ? "Familia dada de baja correctamente."
            : "Familia reactivada correctamente."
        }
        errorMessage={
          stateModal?.activo
            ? "No se pudo dar de baja la familia."
            : "No se pudo reactivar la familia."
        }
      />
    </>
  );
}
