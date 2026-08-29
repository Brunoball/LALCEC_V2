const { uniqueSuffix } = require('../helpers/data.helper');

function userData() {
  const suffix = uniqueSuffix().toLowerCase();
  const mixedSuffix = `${suffix.slice(0, 4)}Case${suffix.slice(4)}`;
  return {
    // La mezcla deliberada de mayúsculas y minúsculas protege la regresión en
    // la que el modal global transformaba el nombre de usuario completo.
    username: `pw_e2e_${mixedSuffix}`.slice(0, 35),
    usernameEdited: `pw_e2e_Edit_${mixedSuffix}`.slice(0, 45),
    email: `pw.${suffix}@example.test`,
    emailEdited: `pw.edit.${suffix}@example.test`,
    password: `Pw!${suffix}1234`,
    newPassword: `Pw!Edit${suffix}5678`,
  };
}

module.exports = { userData };
