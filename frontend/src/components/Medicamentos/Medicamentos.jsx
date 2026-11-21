import React from 'react';
import Stock from './secciones/Stock';
import Prestamos from './secciones/Prestamos';
import EntregasDolor from './secciones/EntregasDolor';
import { Navigate, useParams } from 'react-router-dom';

const PRESENTACION_RUTA = Object.freeze({
  MEDICAMENTOS: { comprimidos:'COMPRIMIDOS', inyectables:'INYECTABLES', gotas:'GOTAS', cremas:'CREMAS', 'otras-os':'OTRAS/OS' },
  DOLOR: { jarabe:'JARABE', concentrado:'CONCENTRADO', 'doble-concentrado':'DOBLE CONCENTRADO', amitriptilina:'AMITRIPTILINA' },
});

/** Las rutas antiguas por presentación redirigen al filtro de la pantalla Stock. */
export default function Medicamentos({ view = 'stock', sector = 'MEDICAMENTOS' }) {
  const { presentacion: filtroRuta } = useParams();
  if (view === 'prestamos') return <Prestamos />;
  if (view === 'entregas') return <EntregasDolor />;
  if (filtroRuta) {
    const presentacion = PRESENTACION_RUTA[sector]?.[filtroRuta];
    const base = sector === 'DOLOR' ? '/medicamentos/dolor/stock' : '/medicamentos/stock';
    return <Navigate to={presentacion ? `${base}?presentacion=${encodeURIComponent(presentacion)}` : base} replace />;
  }
  return <Stock key={sector} sector={sector} />;
}
