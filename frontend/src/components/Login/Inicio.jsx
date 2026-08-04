import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { apiPost } from "../_shared/api/apiClient";
import { saveSession } from "../_shared/auth/session";
import logoLalcec from "../../imagenes/logo_lalcec_sf.png";
import "./inicio.css";

const APP_NAME = "Gestión de Socios";
const REMEMBERED_ACCOUNT_KEY = "gestion_socios_recordar_cuenta";

function loadRememberedAccount() {
  try {
    const account = JSON.parse(localStorage.getItem(REMEMBERED_ACCOUNT_KEY) || "null");
    if (typeof account?.usuario !== "string") {
      return null;
    }
    const sanitized = { usuario: account.usuario };
    localStorage.setItem(REMEMBERED_ACCOUNT_KEY, JSON.stringify(sanitized));
    return sanitized;
  } catch {
    return null;
  }
}

function saveRememberedAccount(usuario) {
  try {
    localStorage.setItem(REMEMBERED_ACCOUNT_KEY, JSON.stringify({ usuario }));
  } catch {
    // El login continúa aunque el navegador bloquee el almacenamiento local.
  }
}

function clearRememberedAccount() {
  try {
    localStorage.removeItem(REMEMBERED_ACCOUNT_KEY);
  } catch {
    // No impide iniciar o cerrar sesión.
  }
}

export default function Inicio() {
  const navigate = useNavigate();
  const [rememberedAccount] = useState(loadRememberedAccount);
  const [usuario, setUsuario] = useState(rememberedAccount?.usuario || "");
  const [contrasena, setContrasena] = useState("");
  const [recordarCuenta, setRecordarCuenta] = useState(Boolean(rememberedAccount));
  const [visible, setVisible] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const ingresar = async (event) => {
    event.preventDefault();
    setMensaje("");
    setCargando(true);
    try {
      const data = await apiPost("auth_login", { usuario: usuario.trim(), contrasena });
      saveSession({
        token: data.token,
        expira_en: data.expira_en,
        usuario: data.usuario,
        organizacion: data.organizacion,
      });

      if (recordarCuenta) {
        saveRememberedAccount(usuario.trim());
      } else {
        clearRememberedAccount();
      }

      navigate("/panel", { replace: true });
    } catch (error) {
      setMensaje(error.message || "No se pudo iniciar sesión.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="ini_contenedor-principal">
      <main className="ini_login-shell" aria-label={`Acceso a ${APP_NAME}`}>
        <section className="ini_brand-panel">
          <div className="ini_brand-glow" aria-hidden="true" />
          <div className="ini_brand-content">
            <div className="ini_brand-logo--placeholder" aria-label="LALCEC San Francisco Córdoba">
              <div className="brand-mark brand-mark--image">
                <img src={logoLalcec} alt="Logo LALCEC San Francisco" />
              </div>
              <div className="brand-word">
                <strong className="brand-word-title">Lalcec</strong>
                <span>San Francisco Córdoba</span>
              </div>
            </div>
            <div className="ini_brand-copy">
              <h2>Administración simple y centralizada</h2>
              <p>Una base preparada para gestionar socios, familias, cuotas, categorías, contabilidad y comunicación por WhatsApp.</p>
            </div>
          </div>
        </section>

        <section className="ini_access-panel">
          <div className="ini_contenedor">
            <div className="ini_encabezado">
              <h1 className="ini_titulo">Iniciar sesión</h1>
              <p className="ini_subtitulo">Ingresá tus credenciales para continuar al panel.</p>
            </div>
            <form className="ini_formulario" onSubmit={ingresar}>
              <div className="ini_campo">
                <input className="ini_input" value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="Usuario" autoComplete="username" required maxLength={100} autoFocus />
              </div>
              <div className="ini_campo ini_campo-password">
                <input className="ini_input" type={visible ? "text" : "password"} value={contrasena} onChange={(e) => setContrasena(e.target.value)} placeholder="Contraseña" autoComplete="current-password" required maxLength={255} />
                <button type="button" className="ini_toggle-password" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={visible}>
                  <FontAwesomeIcon icon={visible ? faEyeSlash : faEye} />
                </button>
              </div>
              <div className="ini_check-row">
                <label className="ini_recordar-wrap">
                  <input
                    className="ini_checkbox"
                    type="checkbox"
                    checked={recordarCuenta}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setRecordarCuenta(checked);
                      if (!checked) clearRememberedAccount();
                    }}
                  />
                  <span>Recordar cuenta</span>
                </label>
              </div>
              {mensaje ? <p className="ini_mensaje-error">{mensaje}</p> : null}
              <button className="ini_boton" type="submit" disabled={cargando}>{cargando ? "Ingresando..." : "Ingresar"}</button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
