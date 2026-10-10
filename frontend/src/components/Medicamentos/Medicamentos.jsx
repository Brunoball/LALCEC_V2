import React from 'react';
import Stock from './secciones/Stock';
import Prestamos from './secciones/Prestamos';

/** Punto de entrada del módulo, siguiendo la organización de Contable y Socios. */
export default function Medicamentos({ view = 'stock' }) {
  return view === 'prestamos' ? <Prestamos /> : <Stock />;
}
