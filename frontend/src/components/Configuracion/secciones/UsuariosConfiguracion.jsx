import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faArrowRotateLeft,
  faGear,
  faPen,
  faTrashCan,
  faUsers,
  faUserSlash,
} from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../../Global/ModulePage";
import CrudModal from "../../Global/Modales/CrudModal";
import ModalEliminarGlobal from "../../Global/Modales/ModalEliminarGlobal";
import ModuleFeedback from "../../Global/ModuleFeedback";
import { getSession, saveSession } from "../../_shared/auth/session";
import { configuracionApi } from "../api/configuracionApi";
import "./UsuariosConfiguracion.css";

const EMPTY_SUMMARY = { total: 0, activos: 0, bajas: 0, admins: 0 };
const EMPTY_FORM = {
  id: "",
  usuario: "",
  email: "",
  rol: "vista",
  contrasena: "",
  confirmar_contrasena: "",
  sesion_actual: false,
};

const ROLE_LABELS = {
  admin: "Administrador",
  vista: "Solo lectura",
};

function formatCreatedAt(value) {
  if (!value) return "Sin fecha";
  return String(value).replace("T", " ").slice(0, 19);
}

function userInitial(value) {
  return String(value || "U").trim().charAt(0).toLocaleUpperCase("es-AR") || "U";
}

function UserStat({ icon, label, value, detail, tone }) {
  return (
    <article className={`config-usersStat config-usersStat--${tone}`}>
      <span className="config-usersStat__icon" aria-hidden="true">
        <FontAwesomeIcon icon={icon} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
      <span className="config-usersStat__decoration" aria-hidden="true" />
    </article>
  );
}

export default function UsuariosConfiguracion({ onBack }) {
  const currentSession = getSession();
  const [data, setData] = useState({
    usuarios: [],
    resumen: EMPTY_SUMMARY,
    capacidades: { email: true, fecha_creacion: true },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("activos");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [stateModal, setStateModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const handleModalToast = useCallback((type, message, duration) => {
    setFeedback({ type, message, duration });
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const response = await configuracionApi.listarUsuarios();
      setData({
        usuarios: response.usuarios || [],
        resumen: { ...EMPTY_SUMMARY, ...(response.resumen || {}) },
        capacidades: {
          email: response.capacidades?.email !== false,
          fecha_creacion: response.capacidades?.fecha_creacion !== false,
        },
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message || "No se pudieron cargar los usuarios." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-AR");
    return data.usuarios.filter((user) => {
      if (statusFilter === "activos" && !user.activo) return false;
      if (statusFilter === "bajas" && user.activo) return false;
      if (!term) return true;
      return [user.usuario, user.email, ROLE_LABELS[user.rol], user.rol]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("es-AR").includes(term));
    });
  }, [data.usuarios, search, statusFilter]);

  const openCreate = () => {
    setFeedback(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (user) => {
    setFeedback(null);
    setForm({
      id: String(user.id),
      usuario: user.usuario || "",
      email: user.email || "",
      rol: user.rol || "vista",
      contrasena: "",
      confirmar_contrasena: "",
      sesion_actual: Boolean(user.sesion_actual),
    });
    setFormOpen(true);
  };

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const saveUser = async (event) => {
    event.preventDefault();
    if (form.contrasena !== form.confirmar_contrasena) {
      setFeedback({ type: "error", message: "Las contraseñas no coinciden." });
      return;
    }
    if (!form.id && form.contrasena.length < 8) {
      setFeedback({ type: "error", message: "La contraseña debe tener al menos 8 caracteres." });
      return;
    }
    if (form.id && form.contrasena && form.contrasena.length < 8) {
      setFeedback({ type: "error", message: "La contraseña debe tener al menos 8 caracteres." });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const response = await configuracionApi.guardarUsuario({
        id: form.id || null,
        usuario: form.usuario.trim(),
        email: form.email.trim() || null,
        rol: form.rol,
        contrasena: form.contrasena,
        confirmar_contrasena: form.confirmar_contrasena,
      });

      if (response.usuario?.sesion_actual && currentSession?.token) {
        saveSession({
          ...currentSession,
          usuario: {
            ...currentSession.usuario,
            nombre: response.usuario.usuario,
            rol: response.usuario.rol,
          },
        });
      }

      setFormOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (error) {
      setFeedback({ type: "error", message: error.message || "No se pudo guardar el usuario." });
    } finally {
      setSaving(false);
    }
  };

  const confirmState = async () => {
    if (!stateModal) return { ok: false };
    setSaving(true);
    try {
      const response = await configuracionApi.cambiarEstadoUsuario(
        stateModal.id,
        !stateModal.activo,
      );
      await cargar();
      return response;
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteModal) return { ok: false };
    setSaving(true);
    try {
      const response = await configuracionApi.eliminarUsuario(deleteModal.id);
      await cargar();
      return response;
    } finally {
      setSaving(false);
    }
  };

  const stats = [
    { icon: faUsers, label: "TOTAL", value: data.resumen.total, detail: "Usuarios registrados", tone: "total" },
    { icon: faArrowRotateLeft, label: "ACTIVOS", value: data.resumen.activos, detail: "Pueden ingresar", tone: "active" },
    { icon: faUserSlash, label: "BAJAS", value: data.resumen.bajas, detail: "Sin acceso activo", tone: "inactive" },
    { icon: faGear, label: "ADMINS", value: data.resumen.admins, detail: "Permiso completo", tone: "admin" },
  ];

  return (
    <>
      <ModulePage
        title="Configuración de usuarios"
        description="Administrá los usuarios del sistema: altas, bajas, edición, roles y contraseña."
        filters={[{
          key: "usuarios-search",
          type: "search",
          label: "Búsqueda",
          value: search,
          onChange: setSearch,
          placeholder: "Usuario, email o rol",
        }]}
        primaryActionLabel="Nuevo usuario"
        onPrimaryAction={openCreate}
        secondaryActions={[{
          key: "volver",
          label: "Volver",
          icon: faArrowLeft,
          onClick: onBack,
        }]}
      >
        <ModuleFeedback
          type={feedback?.type || "error"}
          message={feedback?.message || ""}
          duration={feedback?.duration}
          onClose={() => setFeedback(null)}
        />

        {!data.capacidades.email || !data.capacidades.fecha_creacion ? (
          <div className="config-usersSchemaNotice">
            Ejecutá el SQL incluido en el ZIP sobre lalcec_v2 para completar la estructura de usuarios.
          </div>
        ) : null}

        <section className="config-usersStats" aria-label="Resumen de usuarios">
          {stats.map((stat) => <UserStat key={stat.label} {...stat} />)}
        </section>

        <section className="config-usersPanel">
          <header className="config-usersPanel__toolbar">
            <div className="config-usersTabs" role="tablist" aria-label="Estado de usuarios">
              {[
                { value: "activos", label: "Activos" },
                { value: "bajas", label: "Dados de baja" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === option.value}
                  className={statusFilter === option.value ? "is-active" : ""}
                  onClick={() => setStatusFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <strong>
              {loading
                ? "Cargando usuarios..."
                : `Mostrando ${filteredUsers.length} usuario${filteredUsers.length === 1 ? "" : "s"}`}
            </strong>
          </header>

          <div className="config-usersTable" role="table" aria-label="Usuarios del sistema">
            <div className="config-usersTable__head" role="row">
              <span role="columnheader">Usuario</span>
              <span role="columnheader">Email</span>
              <span role="columnheader">Rol</span>
              <span role="columnheader">Estado</span>
              <span role="columnheader">Creación</span>
              <span role="columnheader">Acciones</span>
            </div>
            <div className="config-usersTable__body" role="rowgroup">
              {!loading && filteredUsers.map((user) => (
                <div className={`config-usersTable__row ${user.activo ? "" : "is-inactive"}`} role="row" key={user.id}>
                  <div className="config-usersIdentity" role="cell">
                    <span className="config-usersAvatar">{userInitial(user.usuario)}</span>
                    <div>
                      <strong>{user.usuario}</strong>
                      {user.sesion_actual ? <small>Sesión actual</small> : null}
                    </div>
                  </div>
                  <div className="config-usersEmail" role="cell">
                    {user.email || <span>Sin email</span>}
                  </div>
                  <div role="cell">
                    <span className={`config-usersRole config-usersRole--${user.rol}`}>
                      {ROLE_LABELS[user.rol] || user.rol}
                    </span>
                  </div>
                  <div role="cell">
                    <span className={`config-usersState ${user.activo ? "is-active" : "is-inactive"}`}>
                      <i aria-hidden="true" />
                      {user.activo ? "Activo" : "Baja"}
                    </span>
                  </div>
                  <div className="config-usersCreated" role="cell">
                    {formatCreatedAt(user.creado_en)}
                  </div>
                  <div className="config-usersActions" role="cell">
                    <button type="button" onClick={() => openEdit(user)} title="Editar usuario" aria-label={`Editar ${user.usuario}`}>
                      <FontAwesomeIcon icon={faPen} />
                    </button>
                    <button
                      type="button"
                      className={user.activo ? "is-warning" : "is-success"}
                      onClick={() => setStateModal(user)}
                      disabled={!user.puede_cambiar_estado}
                      title={user.activo ? "Dar de baja" : "Reactivar"}
                      aria-label={`${user.activo ? "Dar de baja" : "Reactivar"} ${user.usuario}`}
                    >
                      <FontAwesomeIcon icon={user.activo ? faUserSlash : faArrowRotateLeft} />
                    </button>
                    <button
                      type="button"
                      className="is-danger"
                      onClick={() => setDeleteModal(user)}
                      disabled={!user.puede_eliminar}
                      title={user.puede_eliminar ? "Eliminar usuario" : "No se puede eliminar porque tiene historial"}
                      aria-label={`Eliminar ${user.usuario}`}
                    >
                      <FontAwesomeIcon icon={faTrashCan} />
                    </button>
                  </div>
                </div>
              ))}

              {!loading && !filteredUsers.length ? (
                <div className="config-usersEmpty">
                  No hay usuarios que coincidan con los filtros seleccionados.
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </ModulePage>

      <CrudModal
        open={formOpen}
        title={form.id ? "Editar usuario" : "Nuevo usuario"}
        subtitle={form.id
          ? "Actualizá los datos, el rol o la contraseña del usuario."
          : "Creá un acceso independiente para esta organización."}
        onClose={() => setFormOpen(false)}
        onSubmit={saveUser}
        saving={saving}
        submitLabel={form.id ? "Guardar cambios" : "Crear usuario"}
        wide
      >
        <div className="entity-form config-usersForm">
          <div className="entity-form__grid">
            <label className="entity-field">
              <span>Usuario *</span>
              <input
                value={form.usuario}
                onChange={(event) => updateForm("usuario", event.target.value)}
                maxLength={100}
                autoComplete="off"
                required
                autoFocus
              />
            </label>
            <label className="entity-field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateForm("email", event.target.value)}
                maxLength={190}
                autoComplete="off"
                disabled={!data.capacidades.email}
              />
            </label>
            <label className="entity-field">
              <span>Rol *</span>
              <select
                value={form.rol}
                onChange={(event) => updateForm("rol", event.target.value)}
                disabled={form.sesion_actual}
                required
              >
                <option value="admin">Administrador</option>
                <option value="vista">Solo lectura</option>
              </select>
              {form.sesion_actual ? <small>No podés cambiar el rol de tu propia sesión.</small> : null}
            </label>
            <div className="config-usersForm__roleHelp">
              <strong>{form.rol === "admin" ? "Permiso completo" : "Permiso de consulta"}</strong>
              <p>
                {form.rol === "admin"
                  ? "Puede crear, editar, eliminar y administrar usuarios."
                  : "Puede consultar la información, sin realizar modificaciones."}
              </p>
            </div>
            <label className="entity-field">
              <span>{form.id ? "Nueva contraseña" : "Contraseña *"}</span>
              <input
                type="password"
                value={form.contrasena}
                onChange={(event) => updateForm("contrasena", event.target.value)}
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                required={!form.id}
              />
            </label>
            <label className="entity-field">
              <span>{form.id ? "Confirmar nueva contraseña" : "Confirmar contraseña *"}</span>
              <input
                type="password"
                value={form.confirmar_contrasena}
                onChange={(event) => updateForm("confirmar_contrasena", event.target.value)}
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                required={!form.id || Boolean(form.contrasena)}
              />
            </label>
          </div>
          {form.id ? (
            <p className="entity-help">Dejá ambos campos de contraseña vacíos para conservar la actual.</p>
          ) : null}
        </div>
      </CrudModal>

      <ModalEliminarGlobal
        open={Boolean(stateModal)}
        operacion={stateModal?.activo ? "baja" : "alta"}
        row={stateModal}
        title={stateModal?.activo ? "Dar de baja usuario" : "Reactivar usuario"}
        message={stateModal?.activo
          ? "El usuario dejará de poder iniciar sesión y se cerrarán sus sesiones activas."
          : "El usuario volverá a poder iniciar sesión con su contraseña actual."}
        warning={stateModal?.rol === "admin" && stateModal?.activo
          ? "La organización siempre debe conservar al menos un administrador activo."
          : ""}
        confirmLabel={stateModal?.activo ? "Dar de baja" : "Reactivar"}
        loadingLabel={stateModal?.activo ? "Dando de baja..." : "Reactivando..."}
        loadingMessage="Actualizando el acceso del usuario…"
        successMessage={stateModal?.activo
          ? "Usuario dado de baja correctamente."
          : "Usuario reactivado correctamente."}
        errorMessage="No se pudo actualizar el estado del usuario."
        details={stateModal ? [
          { label: "Usuario", value: stateModal.usuario },
          { label: "Rol", value: ROLE_LABELS[stateModal.rol] || stateModal.rol },
          { label: "Estado actual", value: stateModal.activo ? "Activo" : "Baja" },
        ] : []}
        onClose={() => setStateModal(null)}
        onConfirm={confirmState}
        onToast={handleModalToast}
        loading={saving}
      />

      <ModalEliminarGlobal
        open={Boolean(deleteModal)}
        operacion="eliminar"
        row={deleteModal}
        title="Eliminar usuario"
        message="El usuario se eliminará definitivamente porque todavía no tiene historial de accesos."
        warning="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        loadingLabel="Eliminando..."
        loadingMessage="Eliminando usuario…"
        successMessage="Usuario eliminado correctamente."
        errorMessage="No se pudo eliminar el usuario."
        details={deleteModal ? [
          { label: "Usuario", value: deleteModal.usuario },
          { label: "Rol", value: ROLE_LABELS[deleteModal.rol] || deleteModal.rol },
        ] : []}
        onClose={() => setDeleteModal(null)}
        onConfirm={confirmDelete}
        onToast={handleModalToast}
        loading={saving}
      />
    </>
  );
}
