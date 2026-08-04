<?php
declare(strict_types=1);

trait FamiliasGestion
{
    private static function guardarDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = isset($body['id_familia']) && $body['id_familia'] !== ''
            ? positive_id($body['id_familia'], 'familia')
            : null;
        $name = required_text($body, 'nombre', 'nombre', 150);
        $description = optional_text($body['descripcion'] ?? null, 500);
        $memberIds = id_list($body['integrante_ids'] ?? []);
        if ($memberIds === []) {
            api_error('Seleccioná al menos un integrante para la familia.', 'VALIDATION_ERROR');
        }

        try {
            $saved = transaction($db, static function () use ($db, $auth, $id, $name, $description, $memberIds): array {
                $duplicate = $db->prepare('SELECT id_familia FROM familias WHERE nombre = ? AND id_familia <> ? LIMIT 1');
                $duplicate->execute([$name, $id ?? 0]);
                if ($duplicate->fetch()) api_error('Ya existe otra familia con ese nombre.', 'FAMILIA_DUPLICADA');

                $placeholders = implode(',', array_fill(0, count($memberIds), '?'));
                $members = $db->prepare(
                    "SELECT s.id_socio
                     FROM socios s
                     WHERE s.id_socio IN ({$placeholders}) AND (
                        s.activo = 1 OR EXISTS (
                            SELECT 1 FROM familia_socios fs WHERE fs.id_socio = s.id_socio AND fs.id_familia = ?
                        )
                     )
                     FOR UPDATE"
                );
                $members->execute(array_merge($memberIds, [$id ?? 0]));
                if (count($members->fetchAll()) !== count($memberIds)) {
                    api_error('Uno de los integrantes no existe o está inactivo.', 'SOCIO_INACTIVO');
                }

                $conflicts = $db->prepare(
                    "SELECT s.apellido, s.nombre, f.nombre AS familia
                     FROM familia_socios fs
                     INNER JOIN socios s ON s.id_socio = fs.id_socio
                     INNER JOIN familias f ON f.id_familia = fs.id_familia
                     WHERE fs.id_socio IN ({$placeholders})
                       AND fs.id_familia <> ?
                       AND f.activo = 1
                     LIMIT 1"
                );
                $conflicts->execute(array_merge($memberIds, [$id ?? 0]));
                if ($conflict = $conflicts->fetch()) {
                    api_error("{$conflict['apellido']}, {$conflict['nombre']} ya pertenece a {$conflict['familia']}.", 'SOCIO_YA_TIENE_FAMILIA');
                }

                // Una familia dada de baja no debe retener al socio para siempre.
                // La relación anterior se conserva mientras no se lo reasigne; al
                // elegirlo para otra familia activa se libera automáticamente.
                $releaseInactive = $db->prepare(
                    "DELETE fs
                     FROM familia_socios fs
                     INNER JOIN familias f ON f.id_familia = fs.id_familia
                     WHERE fs.id_socio IN ({$placeholders})
                       AND fs.id_familia <> ?
                       AND f.activo = 0"
                );
                $releaseInactive->execute(array_merge($memberIds, [$id ?? 0]));

                $before = null;
                if ($id === null) {
                    $db->prepare('INSERT INTO familias (nombre, descripcion, activo) VALUES (?, ?, 1)')->execute([$name, $description]);
                    $familyId = (int)$db->lastInsertId();
                } else {
                    $lock = $db->prepare('SELECT * FROM familias WHERE id_familia = ? FOR UPDATE');
                    $lock->execute([$id]);
                    $locked = $lock->fetch();
                    if (!$locked) api_error('La familia no existe.', 'FAMILIA_NO_ENCONTRADA', 404);
                    $before = self::detalle($db, $id) ?? $locked;
                    $familyId = $id;
                    $db->prepare('UPDATE familias SET nombre = ?, descripcion = ? WHERE id_familia = ?')->execute([$name, $description, $familyId]);
                    $db->prepare('DELETE FROM familia_socios WHERE id_familia = ?')->execute([$familyId]);
                }

                $insert = $db->prepare('INSERT INTO familia_socios (id_familia, id_socio) VALUES (?, ?)');
                foreach ($memberIds as $memberId) $insert->execute([$familyId, $memberId]);
                $after = self::detalle($db, $familyId);
                audit_change(
                    $db,
                    $auth,
                    'FAMILIAS',
                    $id === null ? 'CREAR' : 'MODIFICAR',
                    'familias',
                    $familyId,
                    $id === null ? "Se creó la familia {$name}." : "Se modificó la familia {$name}.",
                    $before,
                    $after
                );
                return $after ?? [];
            });
        } catch (Throwable $error) {
            if (duplicate_key($error)) {
                api_error('El nombre ya existe o uno de los socios ya pertenece a otra familia.', 'SOCIO_YA_TIENE_FAMILIA');
            }
            throw $error;
        }

        return ['item' => $saved, 'creada' => $id === null];
    }

    private static function cambiarEstadoDatos(array $auth, int $id, bool $active): array
    {
        $db = $auth['db'];
        $saved = transaction($db, static function () use ($db, $auth, $id, $active): array {
            $statement = $db->prepare('SELECT * FROM familias WHERE id_familia = ? FOR UPDATE');
            $statement->execute([$id]);
            $locked = $statement->fetch();
            if (!$locked) api_error('La familia no existe.', 'FAMILIA_NO_ENCONTRADA', 404);
            if ((bool)$locked['activo'] === $active) {
                api_error(
                    $active ? 'La familia ya se encuentra activa.' : 'La familia ya se encuentra dada de baja.',
                    'ESTADO_SIN_CAMBIOS',
                    409
                );
            }
            $before = self::detalle($db, $id) ?? $locked;
            $db->prepare('UPDATE familias SET activo = ? WHERE id_familia = ?')->execute([$active ? 1 : 0, $id]);
            $after = self::detalle($db, $id);
            audit_change(
                $db,
                $auth,
                'FAMILIAS',
                $active ? 'REACTIVAR' : 'DAR_BAJA',
                'familias',
                $id,
                $active ? 'Se reactivó la familia.' : 'Se dio de baja la familia.',
                $before,
                $after
            );
            return $after ?? [];
        });
        return ['item' => $saved];
    }
}
