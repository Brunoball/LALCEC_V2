<?php
declare(strict_types=1);

/**
 * Verifica que la versión simplificada del módulo Contabilidad esté aplicada.
 * La API no crea ni altera tablas durante una petición.
 */
function ensure_contable_schema(PDO $db): void
{
    static $validatedConnections = [];
    $connectionId = spl_object_id($db);
    if (isset($validatedConnections[$connectionId])) return;

    $requiredColumns = [
        'contable_opciones' => ['id_opcion', 'tipo', 'nombre'],
        'contable_ingresos' => [
            'id_ingreso', 'fecha', 'id_medio_pago', 'proveedor',
            'categoria', 'concepto', 'importe', 'detalle',
        ],
        'contable_egresos' => [
            'id_egreso', 'fecha', 'id_medio_pago', 'proveedor',
            'categoria', 'concepto', 'numero_comprobante', 'importe',
            'detalle', 'archivo_path',
        ],
    ];

    $forbiddenColumns = [
        'contable_opciones' => [
            'activo', 'id_usuario_master_creacion', 'id_usuario_master_modificacion',
            'creado_en', 'actualizado_en',
        ],
        'contable_ingresos' => [
            'id_proveedor', 'id_categoria', 'id_concepto',
            'medio_pago_snapshot', 'proveedor_snapshot', 'categoria_snapshot', 'concepto_snapshot',
            'estado', 'fecha_anulacion', 'id_usuario_master_creacion', 'id_usuario_master_modificacion',
            'creado_en', 'actualizado_en',
        ],
        'contable_egresos' => [
            'id_proveedor', 'id_categoria', 'id_concepto',
            'medio_pago_snapshot', 'proveedor_snapshot', 'categoria_snapshot', 'concepto_snapshot',
            'estado', 'fecha_anulacion', 'archivo_nombre_original', 'archivo_nombre_guardado',
            'archivo_mime', 'archivo_tamanio',
            'id_usuario_master_creacion', 'id_usuario_master_modificacion',
            'creado_en', 'actualizado_en',
        ],
    ];

    try {
        foreach ($requiredColumns as $table => $columns) {
            $tableStatement = $db->prepare(
                'SELECT COUNT(*) FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
            );
            $tableStatement->execute([$table]);
            if ((int)$tableStatement->fetchColumn() !== 1) {
                throw new RuntimeException("Falta la tabla {$table}.");
            }

            $columnStatement = $db->prepare(
                'SELECT COLUMN_NAME FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
            );
            $columnStatement->execute([$table]);
            $existing = array_fill_keys($columnStatement->fetchAll(PDO::FETCH_COLUMN), true);

            $missing = array_values(array_filter(
                $columns,
                static fn(string $column): bool => !isset($existing[$column])
            ));
            if ($missing !== []) {
                throw new RuntimeException(
                    "La tabla {$table} no tiene las columnas requeridas: " . implode(', ', $missing) . '.'
                );
            }

            $obsolete = array_values(array_filter(
                $forbiddenColumns[$table] ?? [],
                static fn(string $column): bool => isset($existing[$column])
            ));
            if ($obsolete !== []) {
                throw new RuntimeException(
                    "La tabla {$table} todavía conserva columnas antiguas: " . implode(', ', $obsolete) . '.'
                );
            }
        }
    } catch (Throwable $error) {
        throw new RuntimeException(
            'El módulo Contabilidad necesita la migración clean incluida en el ZIP. Detalle: '
            . $error->getMessage(),
            0,
            $error
        );
    }

    $validatedConnections[$connectionId] = true;
}
