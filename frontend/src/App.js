import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Inicio from "./components/Login/Inicio";
import AppLayout from "./components/Layout/AppLayout";
import Dashboard from "./components/Dashboard/Dashboard";
import Socios from "./components/Socios/ListadoSocios/Socios";
import Familias from "./components/Socios/Familias/Familias";
import Cuotas from "./components/Cuotas/GestionCuotas/Cuotas";
import Categorias from "./components/Categorias/GestionCategorias/Categorias";
import DescuentosFamiliares from "./components/Categorias/DescuentosFamiliares/DescuentosFamiliares";
import Ingresos from "./components/Contable/Ingresos/Ingresos";
import Egresos from "./components/Contable/Egresos/Egresos";
import Resumen from "./components/Contable/Resumen/Resumen";
import Configuracion from "./components/Configuracion/Inicio/Configuracion";
import CuotasCobros from "./components/Configuracion/CuotasCobros/CuotasCobros";
import SociosConfiguracion from "./components/Configuracion/Socios/SociosConfiguracion";
import ContableConfiguracion from "./components/Configuracion/Contable/ContableConfiguracion";
import Usuarios from "./components/Configuracion/Usuarios/Usuarios";
import Ventas from "./components/Ventas/Inicio/Ventas";
import BotPanel from "./components/BotPanel/BotPanel";
import { BOT_PANEL_ROUTE } from "./config/config";
import { isAuthenticated } from "./components/Global/auth/session";

function ProtectedLayout() {
  return isAuthenticated() ? <AppLayout /> : <Navigate to="/" replace />;
}

function ProtectedPage({ children }) {
  return isAuthenticated() ? children : <Navigate to="/" replace />;
}

export default function App() {
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

          <Route path="/socios" element={<Socios />} />
          <Route path="/socios/familias" element={<Familias />} />

          <Route path="/cuotas" element={<Cuotas />} />
          <Route path="/ventas" element={<Ventas />} />

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
          <Route path="/configuracion/cuotas" element={<CuotasCobros />} />
          <Route
            path="/configuracion/socios"
            element={<SociosConfiguracion />}
          />
          <Route
            path="/configuracion/contable"
            element={<ContableConfiguracion />}
          />
          <Route path="/configuracion/usuarios" element={<Usuarios />} />
        </Route>
        <Route path="*" element={<Navigate to="/panel" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
