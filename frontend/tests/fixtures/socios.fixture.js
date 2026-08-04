const { digitsFromSuffix, uniqueSuffix } = require('../helpers/data.helper');

function personData() {
  const suffix = uniqueSuffix();
  return {
    suffix,
    apellido: `PW E2E APELLIDO ${suffix}`,
    nombre: `NOMBRE ${suffix}`,
    nombreEditado: `NOMBRE EDITADO ${suffix}`,
    dni: `9${digitsFromSuffix(suffix, 7)}`.slice(0, 8),
    email: `pw.socio.${suffix.toLowerCase()}@example.test`,
    telefono: `351${digitsFromSuffix(suffix, 7)}`,
  };
}

function companyData() {
  const suffix = uniqueSuffix();
  return {
    suffix,
    razonSocial: `PW E2E EMPRESA ${suffix}`,
    razonSocialEditada: `PW E2E EMPRESA EDITADA ${suffix}`,
    cuit: `30${digitsFromSuffix(suffix, 8)}1`.slice(0, 11),
    email: `pw.empresa.${suffix.toLowerCase()}@example.test`,
    telefono: `354${digitsFromSuffix(suffix, 7)}`,
  };
}

function familyData() {
  const suffix = uniqueSuffix();
  return {
    suffix,
    prefix: `PW E2E FAM ${suffix}`,
    nombre: `PW E2E FAM ${suffix}`,
    nombreEditado: `PW E2E FAM ${suffix} EDITADA`,
    descripcion: `FAMILIA CREADA POR PLAYWRIGHT ${suffix}`,
  };
}

module.exports = { companyData, familyData, personData };
