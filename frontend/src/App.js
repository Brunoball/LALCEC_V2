import React, { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Inicio from "./components/Login/Inicio";
import Principal from "./components/Principal/Principal";
import Dashboard from "./components/Dashboard/Dashboard";
import Socios from "./components/Socios/Socios";
import Familias from "./components/Socios/secciones/Familias";
import Cuotas from "./components/Cuotas/Cuotas";
import Categorias from "./components/Categorias/Categorias";
import DescuentosFamiliares from "./components/Categorias/secciones/DescuentosFamiliares";
import Ingresos from "./components/Contable/secciones/Ingresos";
import Egresos from "./components/Contable/secciones/Egresos";
import Resumen from "./components/Contable/secciones/Resumen";
import Configuracion from "./components/Configuracion/Configuracion";
import Usuarios from "./components/Configuracion/secciones/Usuarios";
import CatalogosConfiguracion from "./components/Configuracion/secciones/CatalogosConfiguracion";
import ContableConfiguracion from "./components/Configuracion/secciones/ContableConfiguracion";
import BotPanel from "./components/BotPanel/BotPanel";
import { BOT_PANEL_ROUTE } from "./config/config";
import {
  AUTH_SESSION_CHANGED_EVENT,
  isAuthenticated,
} from "./components/_shared/auth/session";

function ProtectedLayout() {
  return isAuthenticated() ? <Principal /> : <Navigate to="/" replace />;
}

function ProtectedPage({ children }) {
  if (isAuthenticated()) return children;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "#f5f7fb",
        color: "#1f2937",
      }}
    >
      <section
        style={{
          width: "min(100%, 460px)",
          padding: "36px",
          borderRadius: "18px",
          background: "#ffffff",
          boxShadow: "0 18px 50px rgba(15, 23, 42, 0.12)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "42px", marginBottom: "14px" }}>🔒</div>
        <h1 style={{ margin: "0 0 12px", fontSize: "24px" }}>
          No tenés acceso para acceder al panel
        </h1>
        <p style={{ margin: "0 0 24px", color: "#64748b", lineHeight: 1.5 }}>
          Iniciá sesión en el sistema LALCEC para abrir el Panel Bot.
        </p>
        <button
          type="button"
          onClick={() => window.location.replace("/")}
          style={{
            border: 0,
            borderRadius: "10px",
            padding: "12px 18px",
            background: "#f47b20",
            color: "#ffffff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Ir al inicio de sesión
        </button>
      </section>
    </main>
  );
}

export default function App() {
  const [, setAuthRevision] = useState(0);

  useEffect(() => {
    const refreshAuthState = () => setAuthRevision((revision) => revision + 1);
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, refreshAuthState);
    return () =>
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, refreshAuthState);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            isAuthenticated() ? <Navigate to="/panel" replace /> : <Inicio />
          }
        />
        <Route
          path={BOT_PANEL_ROUTE}
          element={
            <ProtectedPage>
              <BotPanel />
            </ProtectedPage>
          }
        />
        <Route element={<ProtectedLayout />}>
          <Route path="/panel" element={<Dashboard />} />

          <Route
            path="/socios"
            element={<Navigate to="/socios/personas" replace />}
          />
          <Route path="/socios/personas" element={<Socios tipo="PERSONA" />} />
          <Route path="/socios/empresas" element={<Socios tipo="EMPRESA" />} />
          <Route path="/socios/familias" element={<Familias />} />

          <Route path="/cuotas" element={<Cuotas />} />
          <Route path="/categorias" element={<Categorias />} />
          <Route
            path="/categorias/descuentos"
            element={<DescuentosFamiliares />}
          />

          <Route
            path="/contable"
            element={<Navigate to="/contable/ingresos" replace />}
          />
          <Route path="/contable/ingresos" element={<Ingresos />} />
          <Route path="/contable/egresos" element={<Egresos />} />
          <Route path="/contable/resumen" element={<Resumen />} />

          <Route path="/configuracion" element={<Configuracion />} />
          <Route path="/configuracion/usuarios" element={<Usuarios />} />
          <Route
            path="/configuracion/catalogos"
            element={<CatalogosConfiguracion />}
          />
          <Route
            path="/configuracion/contable"
            element={<ContableConfiguracion />}
          />
        </Route>
        <Route path="*" element={<Navigate to="/panel" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
