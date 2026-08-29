import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import Toast from "../Global/Toast";
import { apiPost } from "../_shared/api/apiClient";
import { saveSession } from "../_shared/auth/session";
import lalcecBanner from "../../imagenes/lalcec_banner.png";
import "./inicio.css";

const APP_NAME = "Gestión de Socios";
const REMEMBERED_ACCOUNT_KEY = "gestion_socios_recordar_cuenta";

function loadRememberedAccount() {
  try {
    const account = JSON.parse(localStorage.getItem(REMEMBERED_ACCOUNT_KEY) || "null");
    if (
      typeof account?.usuario !== "string" ||
      typeof account?.contrasena !== "string"
    ) {
      return null;
    }

    return {
      usuario: account.usuario,
      contrasena: account.contrasena,
    };
  } catch {
    return null;
  }
}

function saveRememberedAccount(usuario, contrasena) {
  try {
    localStorage.setItem(
      REMEMBERED_ACCOUNT_KEY,
      JSON.stringify({ usuario, contrasena }),
    );
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
  const [contrasena, setContrasena] = useState(
    rememberedAccount?.contrasena || "",
  );
  const [recordarCuenta, setRecordarCuenta] = useState(Boolean(rememberedAccount));
  const [visible, setVisible] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [toast, setToast] = useState(null);

  const ingresar = async (event) => {
    event.preventDefault();
    setToast(null);

    const usuarioLimpio = usuario.trim();

    if (!usuarioLimpio && !contrasena) {
      setToast({
        tipo: "advertencia",
        mensaje: "Ingresá tu usuario y contraseña.",
      });
      return;
    }

    if (!usuarioLimpio) {
      setToast({ tipo: "advertencia", mensaje: "Ingresá tu usuario." });
      return;
    }

    if (!contrasena) {
      setToast({ tipo: "advertencia", mensaje: "Ingresá tu contraseña." });
      return;
    }

    setCargando(true);
    try {
      const data = await apiPost("auth_login", { usuario: usuarioLimpio, contrasena });
      saveSession({
        token: data.token,
        expira_en: data.expira_en,
        usuario: data.usuario,
        organizacion: data.organizacion,
      });

      if (recordarCuenta) {
        saveRememberedAccount(usuarioLimpio, contrasena);
      } else {
        clearRememberedAccount();
      }

      navigate("/panel", { replace: true });
    } catch (error) {
      const technicalMessage = String(error?.message || "");
      const isNetworkError =
        /Failed to fetch|NetworkError|Network error|Load failed/i.test(
          technicalMessage,
        );

      setToast({
        tipo: "error",
        mensaje: isNetworkError
          ? "No se pudo conectar con el servidor. Intentá nuevamente."
          : technicalMessage || "No se pudo iniciar sesión.",
      });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="ini_contenedor-principal">
      {toast ? (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          onClose={() => setToast(null)}
        />
      ) : null}

      <main className="ini_login-shell" aria-label={`Acceso a ${APP_NAME}`}>
        <section className="ini_brand-panel">
          <div className="ini_brand-glow" aria-hidden="true" />
          <div className="ini_brand-content">
            <img
              className="ini_brand-logo"
              src={lalcecBanner}
              alt="LALCEC San Francisco Córdoba"
            />
            <div className="ini_brand-copy">
              <h2>Administración simple y centralizada</h2>
              <p>Gestión de socios simple y ordenada: cuotas, familias, categorías, contabilidad y WhatsApp en un solo sistema.</p>
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
                <input className="ini_input" value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="Usuario" autoComplete="username" maxLength={100} autoFocus />
              </div>
              <div className="ini_campo ini_campo-password">
                <input className="ini_input" type={visible ? "text" : "password"} value={contrasena} onChange={(e) => setContrasena(e.target.value)} placeholder="Contraseña" autoComplete="current-password" maxLength={255} />
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
              <button className="ini_boton" type="submit" disabled={cargando}>{cargando ? "Ingresando..." : "Ingresar"}</button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
